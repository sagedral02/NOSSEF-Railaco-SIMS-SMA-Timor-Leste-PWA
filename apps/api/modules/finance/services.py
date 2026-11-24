"""Finance use cases (PRD §25, §65.2). All money is Decimal quantized to cents; balances are always recomputed from
VERIFIED allocations inside a locked transaction, so a reversal restores the exact previous balance."""

import calendar
from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from django.db import IntegrityError, transaction
from django.db.models import Q, Sum
from django.utils import timezone

from common.api.exceptions import ConflictError, DomainError, ErrorCode
from common.events import emit
from common.models import next_number
from modules.audit import services as audit
from modules.audit.events import AuditEvent
from modules.documents import services as files
from modules.students.models import EnrollmentStatus, Student, StudentEnrollment

from .models import (
    ZERO,
    Discount,
    FeePlan,
    FeeType,
    Invoice,
    InvoiceItem,
    Payment,
    PaymentAllocation,
    PaymentReversal,
    Receipt,
    Scholarship,
    StudentFeeAssignment,
)

CENT = Decimal("0.01")
HUNDRED = Decimal("100")
IS, P = Invoice.Status, Payment.Status


def q2(v) -> Decimal:
    return Decimal(str(v)).quantize(CENT, rounding=ROUND_HALF_UP)


def _number(prefix, year):
    return f"{prefix}-{year}-{next_number(f'{prefix}:{year}'):06d}"


# ------------------------------------------------------------------ pricing


def _active_on(qs, start, end, d):
    return qs.filter(**{f"{start}__lte": d}).filter(Q(**{f"{end}__isnull": True}) | Q(**{f"{end}__gte": d}))


def plan_for(student, enrollment, fee_type, year):
    """Most specific ACTIVE plan for the student's grade/major (exact > grade-only > all)."""
    plans = FeePlan.objects.filter(academic_year=year, fee_type=fee_type, status=FeePlan.Status.ACTIVE).filter(
        Q(grade_level__isnull=True) | Q(grade_level=enrollment.grade_level_id), Q(major__isnull=True) | Q(major=enrollment.major_id)
    )
    return sorted(plans, key=lambda p: (p.grade_level_id is not None) + (p.major_id is not None), reverse=True)[0] if plans else None


def price(student, plan, on_date):
    """Return (unit_amount, discount_amount, notes) for one billing line at `on_date` (PRD §25.3)."""
    assignment = (
        _active_on(
            StudentFeeAssignment.objects.filter(student=student, fee_plan=plan, status="ACTIVE"),
            "effective_from",
            "effective_until",
            on_date,
        )
        .order_by("-effective_from")
        .first()
    )
    unit = q2(assignment.amount_override if assignment and assignment.amount_override is not None else plan.amount)
    discount, notes = ZERO, []
    for d in _active_on(
        Discount.objects.filter(student=student, academic_year=plan.academic_year, status="ACTIVE").filter(
            Q(fee_type__isnull=True) | Q(fee_type=plan.fee_type)
        ),
        "start_date",
        "end_date",
        on_date,
    ):
        amt = q2(unit * d.value / HUNDRED) if d.discount_type == "PERCENT" else q2(d.value)
        discount += amt
        notes.append(f"Diskon {d.value}{'%' if d.discount_type == 'PERCENT' else ' USD'}")
    for s in _active_on(Scholarship.objects.filter(student=student, status="ACTIVE"), "valid_from", "valid_until", on_date):
        if s.coverage_type == "FULL":
            amt = unit
        elif s.coverage_type == "PERCENT":
            amt = q2(unit * s.value / HUNDRED)
        else:
            amt = q2(s.value)
        discount += amt
        notes.append(f"Beasiswa {s.name}")
    return unit, min(q2(discount), unit), notes


def _period_dates(period, plan):
    y, m = (int(x) for x in period.split("-"))
    last = calendar.monthrange(y, m)[1]
    issue = date(y, m, 1)
    due = date(y, m, min(plan.due_day or 10, last))
    return issue, due


def _month_bounds(period):
    y, m = (int(x) for x in period.split("-"))
    return date(y, m, 1), date(y, m, calendar.monthrange(y, m)[1])


def _eligible_enrollments(year, period):
    """Enrolled at any point in the billing month (PRD §25.3: no invoice after enrollment closed)."""
    first, last = _month_bounds(period)
    return (
        StudentEnrollment.objects.filter(academic_year=year, start_date__lte=last)
        .filter(Q(status=EnrollmentStatus.ACTIVE) | Q(end_date__gte=first))
        .exclude(status=EnrollmentStatus.CANCELLED)
        .filter(student__status="ACTIVE")
        .select_related("student", "grade_level", "major", "classroom")
        .order_by("classroom__code", "student__full_name")
    )


def generation_key(year, student_id, period, fee_code="SPP"):
    return f"{fee_code}:{year.pk}:{student_id}:{period}"


def _validate_period(year, period):
    try:
        y, m = (int(x) for x in period.split("-"))
        d = date(y, m, 1)
    except (ValueError, AttributeError):
        raise DomainError(ErrorCode.VALIDATION_ERROR, "Data tidak valid.", fields={"period": ["Format YYYY-MM."]})
    if not (year.start_date.replace(day=1) <= d <= year.end_date):
        raise DomainError(ErrorCode.VALIDATION_ERROR, "Data tidak valid.", fields={"period": ["Di luar tahun ajaran."]})
    return d


def generation_preview(*, year, period, fee_code="SPP"):
    """Dry run (F9-05): what `generate` would create, without writing."""
    _validate_period(year, period)
    fee_type = FeeType.objects.filter(code=fee_code, active=True).first()
    if fee_type is None:
        raise DomainError(ErrorCode.VALIDATION_ERROR, "Data tidak valid.", fields={"fee_type": ["Jenis biaya tidak aktif."]})
    existing = set(
        Invoice.objects.filter(generation_key__startswith=f"{fee_code}:{year.pk}:", billing_period=period).values_list(
            "student_id", flat=True
        )
    )
    rows, totals = [], {"create": 0, "skip_existing": 0, "no_plan": 0, "amount": ZERO}
    for enr in _eligible_enrollments(year, period):
        plan = plan_for(enr.student, enr, fee_type, year)
        if plan is None:
            totals["no_plan"] += 1
            rows.append(
                {
                    "student_id": str(enr.student_id),
                    "student_no": enr.student.student_no,
                    "full_name": enr.student.full_name,
                    "classroom": enr.classroom.name,
                    "action": "NO_PLAN",
                }
            )
            continue
        unit, disc, notes = price(enr.student, plan, _period_dates(period, plan)[0])
        action = "SKIP_EXISTING" if enr.student_id in existing else "CREATE"
        totals["create" if action == "CREATE" else "skip_existing"] += 1
        if action == "CREATE":
            totals["amount"] += unit - disc
        rows.append(
            {
                "student_id": str(enr.student_id),
                "student_no": enr.student.student_no,
                "full_name": enr.student.full_name,
                "classroom": enr.classroom.name,
                "action": action,
                "amount": str(unit),
                "discount": str(disc),
                "total": str(unit - disc),
                "notes": notes,
            }
        )
    totals["amount"] = str(totals["amount"])
    return {"period": period, "fee_type": fee_code, "totals": totals, "rows": rows}


def generate_invoices(*, actor, year, period, fee_code="SPP"):
    """Idempotent monthly generation (F9-06): one invoice per deterministic generation_key, even on retries/concurrency."""
    preview = generation_preview(year=year, period=period, fee_code=fee_code)
    fee_type = FeeType.objects.get(code=fee_code)
    created = skipped = errors = 0
    students = {str(s.pk): s for s in Student.objects.filter(pk__in=[r["student_id"] for r in preview["rows"] if r["action"] == "CREATE"])}
    for row in preview["rows"]:
        if row["action"] != "CREATE":
            skipped += 1
            continue
        student = students[row["student_id"]]
        enr = _eligible_enrollments(year, period).filter(student=student).first()
        plan = plan_for(student, enr, fee_type, year)
        issue, due = _period_dates(period, plan)
        unit, disc, notes = price(student, plan, issue)
        try:
            with transaction.atomic():
                inv = Invoice.objects.create(
                    invoice_no=_number("INV", issue.year),
                    student=student,
                    academic_year=year,
                    billing_period=period,
                    issue_date=issue,
                    due_date=due,
                    generation_key=generation_key(year, student.pk, period, fee_code),
                    created_by=actor if getattr(actor, "is_authenticated", False) else None,
                )
                InvoiceItem.objects.create(
                    invoice=inv,
                    fee_type=fee_type,
                    description=f"{fee_type.name} {period}" + (f" ({'; '.join(notes)})" if notes else ""),
                    unit_amount=unit,
                    discount_amount=disc,
                    line_total=unit - disc,
                )
                _recompute(inv)
            created += 1
        except IntegrityError:
            skipped += 1  # generation_key already exists (concurrent/retried run)
        except DomainError:
            errors += 1
    if created:
        audit.record(
            AuditEvent.INVOICE_GENERATED,
            actor=actor,
            resource_type="finance.invoice",
            resource_id=f"{fee_code}:{period}",
            metadata={"created": created, "skipped": skipped, "year": year.name},
        )
    return {"created": created, "skipped": skipped, "errors": errors}


@transaction.atomic
def create_manual_invoice(*, actor, student, year, fee_type, items, due_date, issue_date=None, trimester=None):
    """Ad-hoc invoice (registration, activity, exam…). Items: [{description, quantity, unit_amount, discount_amount}]."""
    if not items:
        raise DomainError(ErrorCode.VALIDATION_ERROR, "Data tidak valid.", fields={"items": ["Minimal satu baris."]})
    issue = issue_date or timezone.localdate()
    if due_date < issue:
        raise DomainError(ErrorCode.VALIDATION_ERROR, "Data tidak valid.", fields={"due_date": ["Jatuh tempo sebelum tanggal terbit."]})
    inv = Invoice.objects.create(
        invoice_no=_number("INV", issue.year),
        student=student,
        academic_year=year,
        trimester=trimester,
        issue_date=issue,
        due_date=due_date,
        created_by=actor,
    )
    for it in items:
        qty = Decimal(str(it.get("quantity") or 1))
        unit = q2(it["unit_amount"])
        disc = q2(it.get("discount_amount") or 0)
        gross = q2(qty * unit)
        if unit < 0 or disc < 0 or disc > gross:
            raise DomainError(ErrorCode.PAYMENT_AMOUNT_INVALID, "Nominal atau diskon tidak valid.")
        InvoiceItem.objects.create(
            invoice=inv,
            fee_type=fee_type,
            description=it["description"],
            quantity=qty,
            unit_amount=unit,
            discount_amount=disc,
            line_total=gross - disc,
        )
    _recompute(inv)
    audit.record(AuditEvent.INVOICE_GENERATED, actor=actor, resource=inv, after={"total": str(inv.total)}, metadata={"manual": True})
    return inv


# ------------------------------------------------------------------ balances


def _recompute(inv):
    """Derive totals from items and VERIFIED allocations (caller holds the row lock)."""
    agg = inv.items.aggregate(sub=Sum("line_total"), disc=Sum("discount_amount"))
    line_total = q2(agg["sub"] or 0)
    disc = q2(agg["disc"] or 0)
    inv.subtotal = line_total + disc
    inv.discount_total = disc
    inv.total = line_total
    paid = q2(inv.allocations.filter(payment__status=P.VERIFIED).aggregate(s=Sum("amount"))["s"] or 0)
    if paid > inv.total:
        raise ConflictError(ErrorCode.PAYMENT_OVERALLOCATION, "Alokasi melebihi sisa tagihan.")
    inv.paid_amount = paid
    inv.balance = inv.total - paid
    if inv.status != IS.VOID:
        inv.status = (
            IS.PAID
            if inv.balance == 0 and inv.total > 0
            else (IS.PARTIALLY_PAID if paid > 0 else (IS.PAID if inv.total == 0 else IS.UNPAID))
        )
    inv.save(update_fields=["subtotal", "discount_total", "total", "paid_amount", "balance", "status", "updated_at"])
    return inv


def _lock_invoices(ids):
    return {str(i.pk): i for i in Invoice.objects.select_for_update().filter(pk__in=sorted({str(x) for x in ids})).order_by("id")}


def _allocate(payment, allocations):
    """Validate + persist allocations against locked invoices (PRD §65.2). allocations: [{invoice, amount}]."""
    if not allocations:
        raise DomainError(ErrorCode.VALIDATION_ERROR, "Data tidak valid.", fields={"allocations": ["Pilih tagihan yang dibayar."]})
    invoices = _lock_invoices([a["invoice"] for a in allocations])
    total = ZERO
    seen = set()
    for a in allocations:
        key = str(a["invoice"])
        inv = invoices.get(key)
        amt = q2(a["amount"])
        if inv is None or inv.student_id != payment.student_id:
            raise DomainError(ErrorCode.VALIDATION_ERROR, "Data tidak valid.", fields={"allocations": ["Tagihan bukan milik siswa ini."]})
        if key in seen:
            raise DomainError(ErrorCode.VALIDATION_ERROR, "Data tidak valid.", fields={"allocations": ["Tagihan duplikat."]})
        seen.add(key)
        if inv.status == IS.VOID:
            raise ConflictError(ErrorCode.INVOICE_VOID_NOT_ALLOWED, f"Tagihan {inv.invoice_no} sudah dibatalkan.")
        if amt <= 0:
            raise DomainError(ErrorCode.PAYMENT_AMOUNT_INVALID, "Nominal alokasi harus lebih dari 0.")
        _recompute(inv)  # re-validate after lock
        if amt > inv.balance:
            raise ConflictError(
                ErrorCode.PAYMENT_OVERALLOCATION if inv.balance > 0 else ErrorCode.INVOICE_ALREADY_SETTLED,
                f"Alokasi {amt} melebihi sisa tagihan {inv.invoice_no} ({inv.balance}).",
                details={"invoice": inv.invoice_no, "balance": str(inv.balance)},
            )
        total += amt
    if total != q2(payment.amount):
        raise DomainError(
            ErrorCode.PAYMENT_AMOUNT_INVALID, f"Total alokasi ({total}) harus sama dengan nominal pembayaran ({q2(payment.amount)})."
        )
    for a in allocations:
        PaymentAllocation.objects.create(payment=payment, invoice=invoices[str(a["invoice"])], amount=q2(a["amount"]))
    return invoices.values()


def _receipt(payment, actor):
    allocs = list(payment.allocations.select_related("invoice"))
    enr = payment.student.enrollments.filter(status=EnrollmentStatus.ACTIVE).select_related("classroom").first()
    from modules.school.services import get_profile

    r = Receipt.objects.create(
        receipt_no=_number("RCP", timezone.localdate().year),
        payment=payment,
        issued_at=timezone.now(),
        issued_by=actor,
        snapshot={
            "school_name": get_profile().name,
            "payment_no": payment.payment_no,
            "student_name": payment.student.full_name,
            "student_no": payment.student.student_no,
            "classroom": enr.classroom.name if enr else "",
            "method": payment.method,
            "reference_no": payment.reference_no,
            "amount": str(q2(payment.amount)),
            "payment_date": timezone.localtime(payment.payment_date).strftime("%Y-%m-%d %H:%M"),
            "received_by": actor.full_name or actor.username,
            "allocations": [
                {
                    "invoice_no": a.invoice.invoice_no,
                    "period": a.invoice.billing_period,
                    "amount": str(a.amount),
                    "balance_after": str(a.invoice.balance),
                }
                for a in allocs
            ],
        },
    )
    audit.record(AuditEvent.RECEIPT_GENERATED, actor=actor, resource=r)
    from .tasks import render_receipt_pdf

    rid = str(r.pk)
    transaction.on_commit(lambda: render_receipt_pdf.delay(rid))
    return r


# ------------------------------------------------------------------ payments


def _replay(idempotency_key, actor, student, amount):
    if not idempotency_key:
        return None
    existing = Payment.objects.filter(idempotency_key=idempotency_key).first()
    if existing is None:
        return None
    if existing.student_id != student.pk or q2(existing.amount) != q2(amount) or existing.submitted_by_id != actor.pk:
        raise ConflictError(ErrorCode.PAYMENT_IDEMPOTENCY_CONFLICT, "Kunci idempotensi sudah dipakai untuk pembayaran lain.")
    return existing


@transaction.atomic
def record_cash_payment(*, actor, student, amount, allocations, method="CASH", reference_no="", note="", idempotency_key=None):
    """Cash desk flow (PRD §25.4): VERIFIED payment + allocations + receipt in one transaction."""
    if (replay := _replay(idempotency_key, actor, student, amount)) is not None:
        return replay, False
    amount = q2(amount)
    if amount <= 0:
        raise DomainError(ErrorCode.PAYMENT_AMOUNT_INVALID, "Nominal pembayaran harus lebih dari 0.")
    now = timezone.now()
    try:
        with transaction.atomic():
            payment = Payment.objects.create(
                payment_no=_number("PAY", now.year),
                student=student,
                payment_date=now,
                amount=amount,
                method=method,
                reference_no=reference_no,
                status=P.VERIFIED,
                received_by=actor,
                submitted_by=actor,
                verified_by=actor,
                verified_at=now,
                idempotency_key=idempotency_key or None,
                note=note,
            )
    except IntegrityError:
        replay = _replay(idempotency_key, actor, student, amount)
        if replay is not None:
            return replay, False
        raise
    for inv in _allocate(payment, allocations):
        _recompute(inv)
    audit.record(
        AuditEvent.PAYMENT_CREATED, actor=actor, resource=payment, after={"amount": str(amount), "method": method, "status": "VERIFIED"}
    )
    _receipt(payment, actor)
    emit("payment.verified", payment_id=str(payment.pk))
    return payment, True


@transaction.atomic
def submit_transfer(*, actor, student, amount, reference_no, proof_file, invoice_ids=None, note="", idempotency_key=None):
    """Guardian/student/finance submits bank proof (PRD §25.5): PENDING, never changes balances."""
    if (replay := _replay(idempotency_key, actor, student, amount)) is not None:
        return replay, False
    amount = q2(amount)
    if amount <= 0:
        raise DomainError(ErrorCode.PAYMENT_AMOUNT_INVALID, "Nominal pembayaran harus lebih dari 0.")
    if proof_file is None:
        raise DomainError(ErrorCode.VALIDATION_ERROR, "Data tidak valid.", fields={"proof_file": ["Bukti transfer wajib diunggah."]})
    files.attach(proof_file, expected_purposes={"PAYMENT_PROOF"}, owner=actor)
    ids = [str(i) for i in invoice_ids or []]
    if ids and Invoice.objects.filter(pk__in=ids).exclude(student=student).exists():
        raise DomainError(ErrorCode.VALIDATION_ERROR, "Data tidak valid.", fields={"invoice_ids": ["Tagihan bukan milik siswa ini."]})
    payment = Payment.objects.create(
        payment_no=_number("PAY", timezone.now().year),
        student=student,
        payment_date=timezone.now(),
        amount=amount,
        method=Payment.Method.BANK_TRANSFER,
        reference_no=reference_no,
        status=P.PENDING,
        proof_file=proof_file,
        submitted_by=actor,
        idempotency_key=idempotency_key or None,
        intended_invoices=ids,
        note=note,
    )
    audit.record(
        AuditEvent.PAYMENT_CREATED,
        actor=actor,
        resource=payment,
        after={"amount": str(amount), "method": "BANK_TRANSFER", "status": "PENDING"},
    )
    emit("payment.submitted", payment_id=str(payment.pk))
    return payment, True


def suggest_allocations(payment):
    """Oldest-due-first split of a pending payment over intended (else all open) invoices; Finance may edit."""
    qs = Invoice.objects.filter(student=payment.student, status__in=[IS.UNPAID, IS.PARTIALLY_PAID])
    if payment.intended_invoices:
        qs = qs.filter(pk__in=payment.intended_invoices)
    left, out = q2(payment.amount), []
    for inv in qs.order_by("due_date", "invoice_no"):
        if left <= 0:
            break
        amt = min(left, inv.balance)
        if amt > 0:
            out.append({"invoice": str(inv.pk), "invoice_no": inv.invoice_no, "amount": str(amt), "balance": str(inv.balance)})
            left -= amt
    return out, str(left)


@transaction.atomic
def verify_payment(*, actor, payment, allocations):
    payment = Payment.objects.select_for_update().get(pk=payment.pk)
    if payment.status != P.PENDING:
        raise ConflictError(ErrorCode.INVALID_STATE_TRANSITION, "Hanya pembayaran PENDING yang dapat diverifikasi.")
    invoices = _allocate(payment, allocations)
    payment.status, payment.verified_by, payment.verified_at = P.VERIFIED, actor, timezone.now()
    payment.save(update_fields=["status", "verified_by", "verified_at", "updated_at"])
    for inv in invoices:
        _recompute(inv)  # counts this payment's allocations now that it is VERIFIED
    audit.record(AuditEvent.PAYMENT_VERIFIED, actor=actor, resource=payment, before={"status": "PENDING"}, after={"status": "VERIFIED"})
    _receipt(payment, actor)
    emit("payment.verified", payment_id=str(payment.pk))
    return payment


@transaction.atomic
def reject_payment(*, actor, payment, reason):
    payment = Payment.objects.select_for_update().get(pk=payment.pk)
    if payment.status != P.PENDING:
        raise ConflictError(ErrorCode.INVALID_STATE_TRANSITION, "Hanya pembayaran PENDING yang dapat ditolak.")
    if not reason.strip():
        raise DomainError(ErrorCode.VALIDATION_ERROR, "Data tidak valid.", fields={"reason": ["Wajib."]})
    payment.status, payment.rejection_reason, payment.verified_by, payment.verified_at = P.REJECTED, reason, actor, timezone.now()
    payment.save(update_fields=["status", "rejection_reason", "verified_by", "verified_at", "updated_at"])
    audit.record(AuditEvent.PAYMENT_REJECTED, actor=actor, resource=payment, metadata={"reason": reason[:500]})
    emit("payment.rejected", payment_id=str(payment.pk))
    return payment


@transaction.atomic
def reverse_payment(*, actor, payment, reason, approval_note=""):
    """PRD §25.7: VERIFIED → REVERSED; allocations stay as history but stop counting; balances restored exactly."""
    payment = Payment.objects.select_for_update().get(pk=payment.pk)
    if payment.status == P.REVERSED:
        raise ConflictError(ErrorCode.PAYMENT_ALREADY_REVERSED, "Pembayaran sudah direversal.")
    if payment.status != P.VERIFIED:
        raise ConflictError(ErrorCode.INVALID_STATE_TRANSITION, "Hanya pembayaran VERIFIED yang dapat direversal.")
    if not reason.strip():
        raise DomainError(ErrorCode.VALIDATION_ERROR, "Data tidak valid.", fields={"reason": ["Alasan reversal wajib."]})
    invoices = _lock_invoices(payment.allocations.values_list("invoice_id", flat=True))
    PaymentReversal.objects.create(
        payment=payment, reason=reason, reversed_by=actor, reversed_at=timezone.now(), approval_note=approval_note
    )
    payment.status = P.REVERSED
    payment.save(update_fields=["status", "updated_at"])
    for inv in invoices.values():
        _recompute(inv)
    audit.record(
        AuditEvent.PAYMENT_REVERSED,
        actor=actor,
        resource=payment,
        before={"status": "VERIFIED"},
        after={"status": "REVERSED"},
        metadata={"reason": reason[:500]},
    )
    emit("payment.reversed", payment_id=str(payment.pk))
    return payment


@transaction.atomic
def void_invoice(*, actor, invoice, reason):
    """F9-16: only invoices without verified allocations; paid money must be reversed first."""
    inv = Invoice.objects.select_for_update().get(pk=invoice.pk)
    if inv.status == IS.VOID:
        raise ConflictError(ErrorCode.INVALID_STATE_TRANSITION, "Tagihan sudah dibatalkan.")
    if inv.allocations.filter(payment__status=P.VERIFIED).exists():
        raise ConflictError(
            ErrorCode.INVOICE_VOID_NOT_ALLOWED,
            "Tagihan dengan pembayaran terverifikasi tidak dapat dibatalkan; reversal pembayaran dahulu.",
        )
    if not reason.strip():
        raise DomainError(ErrorCode.VALIDATION_ERROR, "Data tidak valid.", fields={"reason": ["Wajib."]})
    inv.status, inv.void_reason, inv.balance = IS.VOID, reason, ZERO
    inv.save(update_fields=["status", "void_reason", "balance", "updated_at"])
    audit.record(AuditEvent.INVOICE_VOIDED, actor=actor, resource=inv, before={"total": str(inv.total)}, metadata={"reason": reason[:500]})
    return inv


# ------------------------------------------------------------------ reads


def statement(student):
    """Chronological invoice/payment/allocation/reversal ledger (PRD §25.8 student statement)."""
    entries = []
    for inv in Invoice.objects.filter(student=student).exclude(status=IS.VOID):
        entries.append(
            {
                "date": inv.issue_date.isoformat(),
                "type": "INVOICE",
                "ref": inv.invoice_no,
                "description": inv.billing_period or "",
                "debit": str(inv.total),
                "credit": "0.00",
            }
        )
    for p in Payment.objects.filter(student=student, status__in=[P.VERIFIED, P.REVERSED]).select_related("reversal"):
        entries.append(
            {
                "date": timezone.localtime(p.verified_at or p.payment_date).date().isoformat(),
                "type": "PAYMENT",
                "ref": p.payment_no,
                "description": p.method,
                "debit": "0.00",
                "credit": str(p.amount),
            }
        )
        if p.status == P.REVERSED:
            entries.append(
                {
                    "date": timezone.localtime(p.reversal.reversed_at).date().isoformat(),
                    "type": "REVERSAL",
                    "ref": p.payment_no,
                    "description": p.reversal.reason[:120],
                    "debit": str(p.amount),
                    "credit": "0.00",
                }
            )
    entries.sort(key=lambda e: (e["date"], {"INVOICE": 0, "PAYMENT": 1, "REVERSAL": 2}[e["type"]]))
    running = ZERO
    for e in entries:
        running += Decimal(e["debit"]) - Decimal(e["credit"])
        e["balance"] = str(running)
    agg = Invoice.objects.filter(student=student).exclude(status=IS.VOID).aggregate(t=Sum("total"), p=Sum("paid_amount"), b=Sum("balance"))
    overdue = Invoice.objects.filter(
        student=student, status__in=[IS.UNPAID, IS.PARTIALLY_PAID], due_date__lt=timezone.localdate()
    ).aggregate(b=Sum("balance"))["b"]
    return {
        "student_id": str(student.pk),
        "student_no": student.student_no,
        "full_name": student.full_name,
        "total_billed": str(q2(agg["t"] or 0)),
        "total_paid": str(q2(agg["p"] or 0)),
        "outstanding": str(q2(agg["b"] or 0)),
        "overdue": str(q2(overdue or 0)),
        "entries": entries,
    }

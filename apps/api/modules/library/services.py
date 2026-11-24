"""Circulation (PRD §28.3). Copy rows are locked for checkout; due dates are end-of-day school-local; fines are
informational Decimal (never an SPP invoice unless Finance creates one explicitly)."""

import datetime as dt
from decimal import Decimal

from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone

from common.api.exceptions import ConflictError, DomainError, ErrorCode
from modules.audit import services as audit
from modules.audit.events import AuditEvent

from .models import LibraryCopy, LibraryLoan

L, CS = LibraryLoan.Status, LibraryCopy.Status
LOAN_DAYS = getattr(settings, "LIBRARY_LOAN_DAYS", 7)
MAX_RENEWALS = getattr(settings, "LIBRARY_MAX_RENEWALS", 2)
FINE_PER_DAY = Decimal(str(getattr(settings, "LIBRARY_FINE_PER_DAY", "0.00")))


def due_after(days, start=None):
    """End of the school-local day `days` after start (§28.5: timezone uses school-local date)."""
    local = timezone.localtime(start or timezone.now()).date() + dt.timedelta(days=days)
    return timezone.make_aware(dt.datetime.combine(local, dt.time(23, 59, 59)))


def refresh_overdue():
    """OPEN loans past due become OVERDUE (idempotent; run by beat and before overdue reads)."""
    return LibraryLoan.objects.filter(status=L.OPEN, due_at__lt=timezone.now()).update(status=L.OVERDUE)


@transaction.atomic
def checkout(*, actor, copy, student=None, teacher=None, days=None):
    if (student is None) == (teacher is None):
        raise DomainError(
            ErrorCode.VALIDATION_ERROR, "Data tidak valid.", fields={"borrower": ["Pilih tepat satu peminjam (siswa atau guru)."]}
        )
    if student is not None and student.status != "ACTIVE":
        raise ConflictError(ErrorCode.LIBRARY_BORROWER_INACTIVE, "Siswa tidak aktif tidak dapat meminjam.")
    if teacher is not None and teacher.employment_status != "ACTIVE":
        raise ConflictError(ErrorCode.LIBRARY_BORROWER_INACTIVE, "Guru tidak aktif tidak dapat meminjam.")
    copy = LibraryCopy.objects.select_for_update().get(pk=copy.pk)
    if copy.status != CS.AVAILABLE:
        raise ConflictError(
            ErrorCode.LIBRARY_COPY_UNAVAILABLE, f"Eksemplar {copy.barcode} berstatus {copy.status}.", details={"status": copy.status}
        )
    now = timezone.now()
    try:
        with transaction.atomic():
            loan = LibraryLoan.objects.create(
                copy=copy, student=student, teacher=teacher, borrowed_at=now, due_at=due_after(days or LOAN_DAYS, now), issued_by=actor
            )
    except IntegrityError:
        raise ConflictError(ErrorCode.LIBRARY_COPY_UNAVAILABLE, "Eksemplar sedang dipinjam.")
    copy.status = CS.ON_LOAN
    copy.save(update_fields=["status", "updated_at"])
    audit.record(AuditEvent.LIBRARY_LOAN_CHANGED, actor=actor, resource=loan, after={"action": "checkout", "copy": copy.barcode})
    return loan


def _fine(loan, at):
    late_days = (timezone.localtime(at).date() - timezone.localtime(loan.due_at).date()).days
    return (FINE_PER_DAY * late_days).quantize(Decimal("0.01")) if late_days > 0 else Decimal("0.00")


@transaction.atomic
def return_loan(*, actor, loan, condition="GOOD", note=""):
    loan = LibraryLoan.objects.select_for_update().select_related("copy").get(pk=loan.pk)
    if loan.status in {L.RETURNED, L.LOST}:
        raise ConflictError(
            ErrorCode.LIBRARY_LOAN_ALREADY_CLOSED, "Peminjaman sudah ditutup."
        )  # double return rejected clearly, no duplicate event
    now = timezone.now()
    loan.status, loan.returned_at, loan.received_by = L.RETURNED, now, actor
    loan.fine_amount = _fine(loan, now)
    loan.return_condition, loan.resolution_note = condition, note
    loan.save()
    copy = LibraryCopy.objects.select_for_update().get(pk=loan.copy_id)
    copy.condition = condition if condition in LibraryCopy.Condition.values else copy.condition
    copy.status = {"DAMAGED": CS.DAMAGED, "REPAIR": CS.REPAIR}.get(condition, CS.AVAILABLE)
    copy.save(update_fields=["condition", "status", "updated_at"])
    audit.record(
        AuditEvent.LIBRARY_LOAN_CHANGED,
        actor=actor,
        resource=loan,
        after={"action": "return", "condition": condition, "fine": str(loan.fine_amount)},
    )
    return loan


@transaction.atomic
def renew(*, actor, loan, days=None):
    loan = LibraryLoan.objects.select_for_update().get(pk=loan.pk)
    if loan.status not in {L.OPEN, L.OVERDUE}:
        raise ConflictError(ErrorCode.LIBRARY_LOAN_ALREADY_CLOSED, "Peminjaman sudah ditutup.")
    if loan.renew_count >= MAX_RENEWALS:
        raise ConflictError(ErrorCode.LIBRARY_RENEWAL_LIMIT, f"Batas perpanjangan ({MAX_RENEWALS}x) tercapai.")
    before = loan.due_at
    loan.due_at = due_after(days or LOAN_DAYS, max(timezone.now(), loan.due_at))
    loan.renew_count += 1
    loan.status = L.OPEN
    loan.save(update_fields=["due_at", "renew_count", "status", "updated_at"])
    audit.record(
        AuditEvent.LIBRARY_LOAN_CHANGED,
        actor=actor,
        resource=loan,
        before={"due_at": before.isoformat()},
        after={"action": "renew", "due_at": loan.due_at.isoformat()},
    )
    return loan


@transaction.atomic
def mark_lost(*, actor, loan, note):
    loan = LibraryLoan.objects.select_for_update().get(pk=loan.pk)
    if loan.status not in {L.OPEN, L.OVERDUE}:
        raise ConflictError(ErrorCode.LIBRARY_LOAN_ALREADY_CLOSED, "Peminjaman sudah ditutup.")
    if not note.strip():
        raise DomainError(ErrorCode.VALIDATION_ERROR, "Data tidak valid.", fields={"note": ["Catatan penyelesaian wajib."]})
    loan.status, loan.resolution_note, loan.received_by = L.LOST, note, actor
    loan.save(update_fields=["status", "resolution_note", "received_by", "updated_at"])
    LibraryCopy.objects.filter(pk=loan.copy_id).update(status=CS.LOST, condition="LOST", updated_at=timezone.now())
    audit.record(AuditEvent.LIBRARY_LOAN_CHANGED, actor=actor, resource=loan, after={"action": "lost"}, metadata={"note": note[:300]})
    return loan


@transaction.atomic
def set_copy_status(*, actor, copy, status, note=""):
    copy = LibraryCopy.objects.select_for_update().get(pk=copy.pk)
    if copy.status == CS.ON_LOAN:
        raise ConflictError(ErrorCode.LIBRARY_COPY_UNAVAILABLE, "Eksemplar sedang dipinjam; kembalikan dahulu.")
    if status == CS.ON_LOAN:
        raise ConflictError(ErrorCode.INVALID_STATE_TRANSITION, "Gunakan peminjaman untuk status ON_LOAN.")
    before = copy.status
    copy.status = status
    copy.save(update_fields=["status", "updated_at"])
    audit.record(
        AuditEvent.LIBRARY_COPY_CHANGED,
        actor=actor,
        resource=copy,
        before={"status": before},
        after={"status": status},
        metadata={"note": note[:300]},
    )
    return copy

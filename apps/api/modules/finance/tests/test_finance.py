"""PRD §25.10 finance tests + F9 exit criteria."""

import threading
from datetime import date
from decimal import Decimal

import pytest
from django.db import connection
from rest_framework.test import APIClient

from common.api.exceptions import DomainError
from modules.academics.models import GradeLevel
from modules.academics.tests.factories import make_class, make_year
from modules.audit.models import AuditLog
from modules.documents import services as files
from modules.finance import services
from modules.finance.integrity import (
    int_017_invoice_total_matches_items,
    int_018_paid_matches_allocations,
    int_019_no_negative_balance,
    int_020_allocations_within_payment,
)
from modules.finance.models import Discount, FeePlan, FeeType, Invoice, Payment
from modules.finance.seeding import _tiny_png, seed_fee_types
from modules.students import services as students
from modules.students.models import Guardian

pytestmark = pytest.mark.django_db


@pytest.fixture
def ctx(make_user):
    seed_fee_types()
    fin = make_user("fin", roles=["FINANCE_ADMIN"])
    teacher = make_user("guru", roles=["TEACHER"])
    admin = make_user("adm", roles=["SCHOOL_ADMIN"])
    year = make_year()
    cls = make_class(year)
    kids = [
        students.create_student(
            actor=admin,
            data={"full_name": f"Siswa {i}", "birth_date": date(2014, 1, 1 + i), "admission_date": year.start_date},
            classroom=cls,
        )
        for i in range(3)
    ]
    spp = FeeType.objects.get(code="SPP")
    FeePlan.objects.create(
        academic_year=year, fee_type=spp, grade_level=GradeLevel.objects.get(code="X"), amount=Decimal("10.00"), due_day=10, status="ACTIVE"
    )
    return {"fin": fin, "teacher": teacher, "admin": admin, "year": year, "cls": cls, "kids": kids, "spp": spp}


def _gen(ctx, period="2030-02"):
    return services.generate_invoices(actor=ctx["fin"], year=ctx["year"], period=period)


def _inv(ctx, kid=0):
    return Invoice.objects.get(student=ctx["kids"][kid], billing_period="2030-02")


def test_generation_twice_creates_no_duplicate(ctx):
    preview = services.generation_preview(year=ctx["year"], period="2030-02")
    assert preview["totals"]["create"] == 3 and Invoice.objects.count() == 0  # dry run writes nothing
    assert _gen(ctx)["created"] == 3
    assert _gen(ctx) == {"created": 0, "skipped": 3, "errors": 0}
    assert Invoice.objects.count() == 3
    assert _inv(ctx).total == Decimal("10.00") and _inv(ctx).status == "UNPAID"


def test_discount_and_scholarship_applied_server_side(ctx):
    Discount.objects.create(
        student=ctx["kids"][1],
        academic_year=ctx["year"],
        fee_type=ctx["spp"],
        discount_type="PERCENT",
        value=Decimal("25"),
        start_date=ctx["year"].start_date,
        reason="x",
        approved_by=ctx["fin"],
    )
    _gen(ctx)
    inv = _inv(ctx, 1)
    assert inv.subtotal == Decimal("10.00") and inv.discount_total == Decimal("2.50") and inv.total == Decimal("7.50")


def test_cash_payment_partial_then_full_and_overpayment_rejected(ctx):
    _gen(ctx)
    inv = _inv(ctx)
    services.record_cash_payment(actor=ctx["fin"], student=ctx["kids"][0], amount="4", allocations=[{"invoice": inv.pk, "amount": "4"}])
    inv.refresh_from_db()
    assert inv.status == "PARTIALLY_PAID" and inv.balance == Decimal("6.00")
    with pytest.raises(DomainError) as exc:
        services.record_cash_payment(actor=ctx["fin"], student=ctx["kids"][0], amount="7", allocations=[{"invoice": inv.pk, "amount": "7"}])
    assert exc.value.error_code == "PAYMENT_OVERALLOCATION"
    p, _ = services.record_cash_payment(
        actor=ctx["fin"], student=ctx["kids"][0], amount="6", allocations=[{"invoice": inv.pk, "amount": "6"}]
    )
    inv.refresh_from_db()
    assert inv.status == "PAID" and inv.balance == 0
    assert p.receipts.get().snapshot["allocations"][0]["invoice_no"] == inv.invoice_no


def test_idempotent_payment_replay(ctx):
    _gen(ctx)
    inv = _inv(ctx)
    a, created_a = services.record_cash_payment(
        actor=ctx["fin"], student=ctx["kids"][0], amount="5", allocations=[{"invoice": inv.pk, "amount": "5"}], idempotency_key="k-1"
    )
    b, created_b = services.record_cash_payment(
        actor=ctx["fin"], student=ctx["kids"][0], amount="5", allocations=[{"invoice": inv.pk, "amount": "5"}], idempotency_key="k-1"
    )
    assert a.pk == b.pk and created_a and not created_b
    assert Payment.objects.count() == 1
    with pytest.raises(DomainError) as exc:
        services.record_cash_payment(
            actor=ctx["fin"], student=ctx["kids"][0], amount="3", allocations=[{"invoice": inv.pk, "amount": "3"}], idempotency_key="k-1"
        )
    assert exc.value.error_code == "PAYMENT_IDEMPOTENCY_CONFLICT"


def test_reversal_restores_exact_balance_and_requires_reason(ctx):
    _gen(ctx)
    inv = _inv(ctx)
    p, _ = services.record_cash_payment(
        actor=ctx["fin"], student=ctx["kids"][0], amount="10", allocations=[{"invoice": inv.pk, "amount": "10"}]
    )
    with pytest.raises(DomainError):
        services.reverse_payment(actor=ctx["fin"], payment=p, reason=" ")
    services.reverse_payment(actor=ctx["fin"], payment=p, reason="Salah input")
    inv.refresh_from_db()
    assert inv.status == "UNPAID" and inv.balance == Decimal("10.00") and inv.paid_amount == 0
    assert AuditLog.objects.filter(event_type="PAYMENT_REVERSED").exists()
    with pytest.raises(DomainError) as exc:
        services.reverse_payment(actor=ctx["fin"], payment=p, reason="lagi")
    assert exc.value.error_code == "PAYMENT_ALREADY_REVERSED"
    for check in (
        int_017_invoice_total_matches_items,
        int_018_paid_matches_allocations,
        int_019_no_negative_balance,
        int_020_allocations_within_payment,
    ):
        assert check()[1], check()


def test_invoice_with_verified_allocation_cannot_be_voided(ctx):
    _gen(ctx)
    inv = _inv(ctx)
    services.record_cash_payment(actor=ctx["fin"], student=ctx["kids"][0], amount="1", allocations=[{"invoice": inv.pk, "amount": "1"}])
    with pytest.raises(DomainError) as exc:
        services.void_invoice(actor=ctx["fin"], invoice=inv, reason="salah")
    assert exc.value.error_code == "INVOICE_VOID_NOT_ALLOWED"
    other = _inv(ctx, 1)
    services.void_invoice(actor=ctx["fin"], invoice=other, reason="salah")
    other.refresh_from_db()
    assert other.status == "VOID"


def test_bank_proof_pending_until_verified(ctx, make_user):
    _gen(ctx)
    gu = make_user("wali", roles=["GUARDIAN"])
    g = Guardian.objects.create(full_name="Wali", user=gu)
    students.link_guardian(actor=ctx["admin"], student=ctx["kids"][0], guardian=g, relationship="FATHER")
    proof = files.store_bytes(_tiny_png(), original_name="bukti.png", purpose="PAYMENT_PROOF", uploaded_by=gu)
    api = APIClient()
    api.force_authenticate(gu)
    inv = _inv(ctx)
    r = api.post(
        "/api/v1/finance/payments/",
        {
            "student": str(ctx["kids"][0].pk),
            "amount": "10",
            "method": "BANK_TRANSFER",
            "reference_no": "BNU-1",
            "proof_file": str(proof.pk),
            "invoice_ids": [str(inv.pk)],
        },
        format="json",
    )
    assert r.status_code == 201, r.content
    pid = r.json()["data"]["id"]
    inv.refresh_from_db()
    assert r.json()["data"]["status"] == "PENDING" and inv.balance == Decimal("10.00")  # proof alone never pays
    # Guardian cannot verify, and sees only the linked child.
    assert api.post(f"/api/v1/finance/payments/{pid}/verify/", {}, format="json").status_code == 403
    assert api.get(f"/api/v1/finance/students/{ctx['kids'][1].pk}/statement/").status_code == 404
    rows = api.get("/api/v1/finance/invoices/").json()["data"]
    assert {x["student"] for x in rows} == {str(ctx["kids"][0].pk)}
    fin = APIClient()
    fin.force_authenticate(ctx["fin"])
    r = fin.post(f"/api/v1/finance/payments/{pid}/verify/", {}, format="json")
    assert r.status_code == 200 and r.json()["data"]["status"] == "VERIFIED"
    inv.refresh_from_db()
    assert inv.status == "PAID"


def test_teacher_cannot_access_finance(ctx):
    _gen(ctx)
    api = APIClient()
    api.force_authenticate(ctx["teacher"])
    assert api.get("/api/v1/finance/invoices/").json()["data"] == []
    r = api.post("/api/v1/finance/invoices/generate/", {"academic_year": str(ctx["year"].pk), "period": "2030-03"}, format="json")
    assert r.status_code == 403
    assert api.get("/api/v1/finance/reports/summary/").status_code == 403
    assert (
        api.post(
            "/api/v1/finance/payments/", {"student": str(ctx["kids"][0].pk), "amount": "1", "method": "CASH"}, format="json"
        ).status_code
        == 404
    )


@pytest.mark.django_db(transaction=True)
def test_concurrent_payments_cannot_overpay(make_user):
    seed_fee_types()
    from modules.accounts.seeding import seed_roles_and_permissions

    seed_roles_and_permissions()
    fin = make_user("fin2", roles=["FINANCE_ADMIN"])
    admin = make_user("adm2", roles=["SCHOOL_ADMIN"])
    year = make_year()
    cls = make_class(year)
    kid = students.create_student(
        actor=admin, data={"full_name": "Siswa", "birth_date": date(2014, 1, 1), "admission_date": year.start_date}, classroom=cls
    )
    FeePlan.objects.create(academic_year=year, fee_type=FeeType.objects.get(code="SPP"), amount=Decimal("10.00"), status="ACTIVE")
    services.generate_invoices(actor=fin, year=year, period="2030-02")
    inv = Invoice.objects.get(student=kid)
    results = []

    def pay():
        try:
            services.record_cash_payment(actor=fin, student=kid, amount="8", allocations=[{"invoice": inv.pk, "amount": "8"}])
            results.append("ok")
        except DomainError as exc:
            results.append(exc.error_code)
        finally:
            connection.close()

    threads = [threading.Thread(target=pay) for _ in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    inv.refresh_from_db()
    assert sorted(results) == ["PAYMENT_OVERALLOCATION", "ok"]
    assert inv.paid_amount == Decimal("8.00") and inv.balance == Decimal("2.00")


def test_reports_summary_and_arrears(ctx):
    _gen(ctx)
    api = APIClient()
    api.force_authenticate(ctx["fin"])
    r = api.get("/api/v1/finance/reports/summary/", {"academic_year_id": str(ctx["year"].pk)})
    assert r.status_code == 200 and r.json()["data"]["totals"]["billed"] == "30.00"
    r = api.get("/api/v1/finance/reports/arrears/", {"academic_year_id": str(ctx["year"].pk)})
    assert r.status_code == 200 and len(r.json()["data"]) == 3
    r = api.get("/api/v1/finance/reports/arrears/", {"export": "csv"})
    assert r.status_code == 200 and b"student_no" in r.content

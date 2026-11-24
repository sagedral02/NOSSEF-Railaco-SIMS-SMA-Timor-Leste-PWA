"""Finance seeders: reference fee types (safe everywhere) and synthetic demo billing (local only)."""

import random
import struct
import zlib
from datetime import date
from decimal import Decimal

from .models import FeeType

FEE_TYPES = [
    ("SPP", "SPP / Propina Mensal", "MONTHLY"),
    ("REGISTRATION", "Biaya Pendaftaran / Matrikula", "ONE_TIME"),
    ("ACTIVITY", "Biaya Kegiatan / Atividade", "YEARLY"),
    ("EXAM", "Biaya Ujian / Ezame", "TRIMESTER"),
    ("OTHER", "Lainnya / Seluk", "MANUAL"),
]
SPP_BY_GRADE = {"X": Decimal("10.00"), "XI": Decimal("12.00"), "XII": Decimal("15.00")}


def seed_fee_types():
    created = 0
    for code, name, rec in FEE_TYPES:
        _, c = FeeType.objects.get_or_create(code=code, defaults={"name": name, "recurrence": rec})
        created += c
    return {"created": created}


def _tiny_png():
    """1×1 synthetic PNG used as demo transfer proof (no real documents in demo data)."""

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(b"\x00\xff\xff\xff"))
        + chunk(b"IEND", b"")
    )


def seed_demo_finance():
    from django.utils import timezone

    from common.seeding import assert_demo_allowed
    from modules.academics.models import AcademicYear, GradeLevel
    from modules.accounts.models import User
    from modules.documents import services as files
    from modules.students.models import Student

    from . import services
    from .models import Discount, FeePlan, Invoice, Payment, Scholarship

    assert_demo_allowed()
    year = AcademicYear.objects.filter(name="2026").first()
    if year is None or Invoice.objects.filter(academic_year=year).exists():
        return {"skipped": True}
    seed_fee_types()
    cashier = User.objects.get(username="finansas")
    spp = FeeType.objects.get(code="SPP")
    for code, amount in SPP_BY_GRADE.items():
        FeePlan.objects.get_or_create(
            academic_year=year,
            fee_type=spp,
            grade_level=GradeLevel.objects.get(code=code),
            major=None,
            defaults={"amount": amount, "due_day": 10, "status": "ACTIVE"},
        )
    FeePlan.objects.get_or_create(
        academic_year=year,
        fee_type=FeeType.objects.get(code="ACTIVITY"),
        grade_level=None,
        major=None,
        defaults={"amount": Decimal("5.00"), "status": "ACTIVE"},
    )
    rnd = random.Random(2026)
    students = list(Student.objects.filter(status="ACTIVE").order_by("student_no"))
    for s in students[5:8]:
        Discount.objects.create(
            student=s,
            academic_year=year,
            fee_type=spp,
            discount_type="PERCENT",
            value=Decimal("50"),
            start_date=year.start_date,
            reason="Saudara kandung (demo)",
            approved_by=cashier,
        )
    for s in students[8:10]:
        Scholarship.objects.create(student=s, name="Beasiswa Prestasi (demo)", coverage_type="FULL", valid_from=year.start_date)

    today = timezone.localdate()
    periods = []
    d = date(year.start_date.year, year.start_date.month, 1)
    while d <= min(today, year.end_date):
        periods.append(f"{d:%Y-%m}")
        d = date(d.year + (d.month == 12), d.month % 12 + 1, 1)
    generated = 0
    for period in periods:
        generated += services.generate_invoices(actor=cashier, year=year, period=period)["created"]

    payments = pending = 0
    for i, s in enumerate(students):
        open_inv = list(Invoice.objects.filter(student=s, status="UNPAID", total__gt=0).order_by("due_date"))
        if not open_inv:
            continue
        # Most families are up to date; ~20% are 2–4 months behind; a few owe more.
        behind = 0 if rnd.random() < 0.7 else rnd.choice([1, 2, 3, 4, 6])
        pay = open_inv[: max(0, len(open_inv) - behind)]
        if pay:
            allocs = [{"invoice": inv.pk, "amount": inv.balance} for inv in pay]
            last = allocs[-1]
            if i % 17 == 0 and len(allocs) > 1:  # partial payment on the latest month
                last["amount"] = (last["amount"] / 2).quantize(Decimal("0.01"))
            services.record_cash_payment(
                actor=cashier,
                student=s,
                amount=sum(a["amount"] for a in allocs),
                allocations=allocs,
                method="CASH" if i % 3 else "BANK_TRANSFER",
                reference_no="" if i % 3 else f"BNCTL-{2026000 + i}",
                idempotency_key=f"demo-pay-{s.student_no}",
            )
            payments += 1
        rest = list(Invoice.objects.filter(student=s, status="UNPAID").order_by("due_date"))
        if rest and i % 11 == 0:  # pending bank-transfer proof waiting for Finance verification
            proof = files.store_bytes(_tiny_png(), original_name="bukti_transfer.png", purpose="PAYMENT_PROOF", uploaded_by=cashier)
            services.submit_transfer(
                actor=cashier,
                student=s,
                amount=rest[0].balance,
                reference_no=f"BNU-{9000 + i}",
                proof_file=proof,
                invoice_ids=[rest[0].pk],
                note="Bukti transfer diunggah wali (demo)",
            )
            pending += 1
    # One reversed payment to demonstrate history-preserving correction.
    victim = Payment.objects.filter(status="VERIFIED").order_by("payment_no").last()
    if victim:
        services.reverse_payment(actor=cashier, payment=victim, reason="Salah input nominal (demo)")
    return {"invoices": generated, "payments": payments, "pending": pending, "periods": len(periods)}

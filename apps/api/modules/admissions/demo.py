"""Synthetic admissions demo: next-year intake period with applicants in every workflow state."""

import random
from datetime import date, timedelta

from django.db import transaction
from django.utils import timezone

from modules.academics.models import AcademicYear, ClassRoom, GradeLevel, Major, Trimester
from modules.documents import services as files
from modules.students.demo import JOBS, random_name

from . import services
from .models import DEFAULT_REQUIRED, AdmissionPeriod, ApplicantDocument

TINY_PDF = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"


@transaction.atomic
def seed_demo_admissions():
    from modules.accounts.models import User

    if AdmissionPeriod.objects.exists():
        return {"skipped": True}
    officer = User.objects.filter(username="admisaun").first()
    principal = User.objects.filter(username="cristina.amaral").first()
    year, created = AcademicYear.objects.get_or_create(
        name="2027", defaults={"start_date": date(2027, 1, 18), "end_date": date(2027, 12, 3)}
    )
    if created:
        for n, (s, e) in enumerate(
            [(date(2027, 1, 18), date(2027, 4, 9)), (date(2027, 4, 26), date(2027, 8, 6)), (date(2027, 8, 23), date(2027, 12, 3))], 1
        ):
            Trimester.objects.create(academic_year=year, number=n, cau_number=n, name=f"Trimestre {n}", start_date=s, end_date=e)
        x = GradeLevel.objects.get(code="X")
        for m in Major.objects.all():
            ClassRoom.objects.create(academic_year=year, grade_level=x, major=m, code=f"X-{m.code}-1", name=f"X {m.code} 1", capacity=36)
    now = timezone.now()
    period = AdmissionPeriod.objects.create(
        academic_year=year,
        name="PPDB 2027 — Kelas X",
        registration_start=now - timedelta(days=20),
        registration_end=now + timedelta(days=60),
        capacity_total=144,
        required_documents=DEFAULT_REQUIRED,
    )
    services.period_transition(actor=officer, period=period, action="open")
    rng = random.Random(2027)
    majors = list(Major.objects.all())
    plan = (
        ["DRAFT"] * 2
        + ["SUBMITTED"] * 3
        + ["VERIFIED"] * 2
        + ["ELIGIBLE"] * 2
        + ["ACCEPTED"] * 3
        + ["WAITING_LIST", "REJECTED", "RE_REGISTERED"]
    )
    for i, target in enumerate(plan):
        gender = "F" if i % 2 else "M"
        name = random_name(rng, gender)
        applicant, _ = services.create_applicant(
            actor=officer,
            period=period,
            data={
                "full_name": name,
                "birth_date": date(2011, rng.randint(1, 12), rng.randint(1, 28)),
                "gender": gender,
                "birth_place": "Railaco",
                "previous_school": rng.choice(["EBC Railaco", "EBC Tokoluli", "EBF Samalete"]),
                "desired_major": majors[i % 2],
                "phone": f"+670 78{rng.randint(10, 99)} {rng.randint(1000, 9999)}",
            },
            guardians=[
                {
                    "full_name": f"{rng.choice(['Domingos', 'Rosa', 'Mateus', 'Joana'])} {name.split()[-1]}",
                    "relationship": "FATHER",
                    "phone": f"+670 77{rng.randint(10, 99)} {rng.randint(1000, 9999)}",
                    "occupation": rng.choice(JOBS),
                    "is_primary": True,
                }
            ],
        )
        if target == "DRAFT":
            continue
        for doc_type in DEFAULT_REQUIRED:
            stored = files.store_bytes(TINY_PDF, original_name=f"{doc_type.lower()}.pdf", purpose="ADMISSION_DOCUMENT")
            services.add_document(actor=officer, applicant=applicant, document_type=doc_type, file=stored)
        services.submit(actor=officer, applicant=applicant)
        if target == "SUBMITTED":
            continue
        for doc in applicant.documents.filter(active=True):
            services.verify_document(actor=officer, document=doc, status=ApplicantDocument.Verification.VALID)
        services.verify(actor=officer, applicant=applicant)
        if target == "VERIFIED":
            continue
        services.mark_eligible(actor=officer, applicant=applicant)
        if target == "ELIGIBLE":
            continue
        decision = "ACCEPTED" if target in {"ACCEPTED", "RE_REGISTERED"} else target
        services.decide(
            actor=principal,
            applicant=applicant,
            decision=decision,
            score=rng.randint(55, 95),
            rank=i + 1,
            note="" if decision != "REJECTED" else "Nilai seleksi di bawah ambang batas.",
        )
        if target == "RE_REGISTERED":
            services.re_register(actor=officer, applicant=applicant)
    return {"period": period.name, "applicants": len(plan)}

"""Reference assessment types (PRD §53.1) and a synthetic demo gradebook."""

import random
from datetime import timedelta
from decimal import Decimal

from django.db import transaction

from .models import AssessmentType

TYPES = [
    ("ASSIGNMENT", "Trabalho de Casa (TPC) / Tugas"),
    ("QUIZ", "Teste / Kuis"),
    ("PRACTICAL", "Prátika / Praktik"),
    ("PROJECT", "Projetu / Proyek"),
    ("CAU", "CAU — Ezame Trimestrál"),
    ("OTHER", "Seluk / Lainnya"),
]


@transaction.atomic
def seed_assessment_types():
    created = 0
    for code, name in TYPES:
        _, c = AssessmentType.objects.get_or_create(code=code, defaults={"name": name})
        created += c
    return {"created": created}


def seed_demo_grades():
    from modules.academics.models import AcademicYear, TeachingAssignment
    from modules.accounts.models import User
    from modules.report_cards import services as reports
    from modules.report_cards.models import ReportCard

    from . import services
    from .models import Assessment, StudentScore

    year = AcademicYear.objects.filter(name="2026").first()
    if year is None or Assessment.objects.filter(trimester__academic_year=year).exists():
        return {"skipped": True}
    seed_assessment_types()
    admin = User.objects.get(username="admin")
    rng = random.Random(42)
    ability = {}
    n_scores = 0
    for t in year.trimesters.order_by("number"):
        with transaction.atomic():
            for off in year.subject_offerings.filter(active=True):
                services.create_scheme_from_template(actor=admin, offering=off, trimester=t)
        for ta in TeachingAssignment.objects.filter(academic_year=year, active=True).select_related("subject_offering", "classroom"):
            scheme = services.active_scheme(ta.subject_offering, t)
            students = list(services.roster(ta, t))
            batch = []
            with transaction.atomic():
                for comp in scheme.components.all():
                    offset = {"TPC": 20, "Teste 1": 35, "Teste 2": 55}.get(comp.name, 70)
                    a = Assessment.objects.create(
                        teaching_assignment=ta,
                        trimester=t,
                        assessment_type=comp.assessment_type,
                        grading_component=comp,
                        title=comp.name,
                        assessment_date=min(t.start_date + timedelta(days=offset), t.end_date),
                        max_score=Decimal("10"),
                        cau_number=t.number if comp.is_cau_component else None,
                        status="CLOSED" if t.number < 3 else "OPEN",
                    )
                    if t.number == 3 and (comp.name == "Teste 2" or comp.is_cau_component):
                        continue  # trimester 3 still in progress
                    for st in students:
                        base = ability.setdefault(st.pk, rng.uniform(4.5, 9.2))
                        r = rng.random()
                        if r < 0.01:
                            batch.append(StudentScore(assessment=a, student=st, status="ABSENT", recorded_by=admin))
                        else:
                            score = max(0, min(10, base + rng.uniform(-1.6, 1.4)))
                            batch.append(
                                StudentScore(assessment=a, student=st, score=Decimal(f"{score:.2f}"), status="GRADED", recorded_by=admin)
                            )
                StudentScore.objects.bulk_create(batch)
                n_scores += len(batch)
            if t.number < 3:
                services.finalize(actor=admin, assignment=ta, trimester=t)
            else:
                services.recalculate(actor=admin, assignment=ta, trimester=t)
    published = 0
    for t in year.trimesters.filter(number__lt=3).order_by("number"):
        for cls in year.classrooms.all():
            reports.generate(actor=admin, classroom=cls, trimester=t)
            ids = list(ReportCard.objects.filter(trimester=t, enrollment__classroom=cls, status__in=["DRAFT", "REVIEWED"]))
            for r in ids:
                r.homeroom_note = rng.choice(
                    [
                        "Kontinua estuda ho diak.",
                        "Prestasaun diak, presiza atensaun ba Matemátika.",
                        "Disiplina diak no partisipativu iha klase.",
                        "Hadia prezensa no kumpre TPC.",
                    ]
                )
                r.save(update_fields=["homeroom_note"])
            published += reports.publish(actor=admin, reports=ids)["published"]
    from modules.academics.services import advance_trimester

    for t in year.trimesters.filter(number__lt=3, status="GRADING"):
        advance_trimester(actor=admin, trimester=t, target="CLOSED")
    return {"scores": n_scores, "report_cards_published": published}

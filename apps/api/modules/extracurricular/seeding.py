"""Synthetic extracurricular demo data (local only)."""

from datetime import timedelta

from django.db import transaction

# ui.md SCREEN-15 program units; extra activities created by the demo seeder.
NOSSEF_UNITS = [
    ("KORENOSSEF", "Kamis 14.00", 30),
    ("Ekipa Pastoral Eskolár", "Jumat 15.00", 40),
    ("Drum Band / Fanfarra", "Sabtu 09.00", 50),
]
CATEGORY_BY_NAME = {
    "Futebol": "SPORTS",
    "Koru / Paduan Suara": "PASTORAL",
    "Klube Matemátika": "ACADEMIC",
    "Dansa Tradisionál": "OTHER",
    "Jornalizmu Eskola": "ACADEMIC",
    "KORENOSSEF": "LEADERSHIP",
    "Ekipa Pastoral Eskolár": "PASTORAL",
    "Drum Band / Fanfarra": "DRUM_BAND",
}


@transaction.atomic
def seed_demo_extracurricular():
    from django.utils import timezone

    from common.seeding import assert_demo_allowed
    from modules.academics.models import AcademicYear
    from modules.accounts.models import User
    from modules.staff.models import Teacher
    from modules.students.models import Student

    from . import services
    from .models import ExtracurricularActivity

    assert_demo_allowed()
    year = AcademicYear.objects.filter(name="2026").first()
    if year is None or ExtracurricularActivity.objects.filter(academic_year=year).exists():
        return {"skipped": True}
    admin = User.objects.get(username="sekretaria")
    teachers = list(Teacher.objects.order_by("full_name")[:5])
    advisor = Teacher.objects.filter(user__username="agostinho.freitas").first()
    kids = list(Student.objects.filter(status="ACTIVE").order_by("full_name"))
    specs = [
        ("Futebol", "Selasa & Kamis 15.30", 20, advisor),
        ("Koru / Paduan Suara", "Rabu 15.00", 25, teachers[0] if teachers else None),
        ("Klube Matemátika", "Jumat 14.00", 15, teachers[1] if len(teachers) > 1 else None),
        ("Dansa Tradisionál", "Sabtu 08.00", 18, teachers[2] if len(teachers) > 2 else None),
        ("Jornalizmu Eskola", "Senin 15.00", 10, teachers[3] if len(teachers) > 3 else None),
    ]
    specs += [(name, sched, cap, teachers[4] if len(teachers) > 4 else advisor) for name, sched, cap in NOSSEF_UNITS]
    today = timezone.localdate()
    total = 0
    for i, (name, sched, cap, adv) in enumerate(specs):
        act = ExtracurricularActivity.objects.create(
            academic_year=year,
            category=CATEGORY_BY_NAME.get(name, "OTHER"),
            name=name,
            schedule_text=sched,
            capacity=cap,
            advisor_teacher=adv,
            description=f"Kegiatan {name} (demo).",
        )
        members = kids[i * 17 : i * 17 + cap + 2]  # two extra land on the waitlist
        for k in members:
            services.add_member(actor=admin, activity=act, student=k)
            total += 1
        active = [m.student for m in act.memberships.filter(status="ACTIVE")]
        for w in range(3):
            d = today - timedelta(days=7 * (w + 1))
            services.record_attendance(
                actor=admin,
                activity=act,
                date=d,
                records=[{"student": s, "status": "PRESENT" if (j + w) % 6 else "ABSENT"} for j, s in enumerate(active)],
            )
    return {"activities": len(specs), "memberships": total}


@transaction.atomic
def seed_demo_programs():
    """Idempotent top-up for existing demo databases: activity categories and one class president per class."""
    from common.seeding import assert_demo_allowed
    from modules.academics.models import ClassRoom

    from .models import ExtracurricularActivity

    assert_demo_allowed()
    categorized = 0
    for name, category in CATEGORY_BY_NAME.items():
        categorized += (
            ExtracurricularActivity.objects.filter(name=name, category="OTHER").exclude(category=category).update(category=category)
        )
    presidents = 0
    for room in ClassRoom.objects.filter(active=True, class_president__isnull=True):
        enr = room.enrollments.filter(status="ACTIVE").order_by("student__full_name").first()
        if enr:
            room.class_president_id = enr.student_id
            room.save(update_fields=["class_president", "updated_at"])
            presidents += 1
    return {"categorized": categorized, "class_presidents": presidents}

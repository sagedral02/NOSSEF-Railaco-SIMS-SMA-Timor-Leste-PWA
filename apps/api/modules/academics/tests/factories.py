"""Synthetic academic fixtures for tests (PRD §45; never real PII)."""

from datetime import date

from modules.academics.models import (
    AcademicYear,
    BellPeriod,
    ClassRoom,
    GradeLevel,
    Major,
    Subject,
    SubjectOffering,
    TeachingAssignment,
    Trimester,
)
from modules.academics.seeding import seed_academic_reference
from modules.staff.models import Teacher


def make_year(name="2030", start=date(2030, 1, 7), end=date(2030, 12, 6), trimesters=True):
    seed_academic_reference()
    year = AcademicYear.objects.create(name=name, start_date=start, end_date=end)
    if trimesters:
        for n, (s, e) in enumerate(
            [(date(2030, 1, 7), date(2030, 4, 10)), (date(2030, 4, 20), date(2030, 8, 7)), (date(2030, 8, 20), date(2030, 12, 6))], start=1
        ):
            Trimester.objects.create(academic_year=year, number=n, cau_number=n, name=f"Trimestre {n}", start_date=s, end_date=e)
    return year


def grade(code="X"):
    seed_academic_reference()
    return GradeLevel.objects.get(code=code)


def major(code="IPA"):
    seed_academic_reference()
    return Major.objects.get(code=code)


def make_teacher(name="Guru Uji", user=None, **kw):
    return Teacher.objects.create(full_name=name, user=user, **kw)


def make_class(year, code="X-IPA-1", grade_code="X", major_code="IPA", homeroom=None):
    return ClassRoom.objects.create(
        academic_year=year,
        grade_level=grade(grade_code),
        major=major(major_code),
        code=code,
        name=code.replace("-", " "),
        homeroom_teacher=homeroom,
    )


def make_offering(year, subject_code="MAT", grade_code="X", major_code=None, weekly=4):
    subject, _ = Subject.objects.get_or_create(code=subject_code, defaults={"name": subject_code})
    return SubjectOffering.objects.create(
        academic_year=year,
        grade_level=grade(grade_code),
        major=major(major_code) if major_code else None,
        subject=subject,
        weekly_periods=weekly,
    )


def make_assignment(teacher, classroom, offering):
    return TeachingAssignment.objects.create(
        academic_year=classroom.academic_year, teacher=teacher, classroom=classroom, subject_offering=offering
    )


def ready_year(**kw):
    """A year that passes the activation gate: trimesters, bell period, class, offering, assignment."""
    year = make_year(**kw)
    BellPeriod.objects.get_or_create(sequence=1, defaults={"name": "Jam 1", "start_time": "07:30", "end_time": "08:15"})
    cls = make_class(year)
    off = make_offering(year)
    make_assignment(make_teacher(), cls, off)
    return year

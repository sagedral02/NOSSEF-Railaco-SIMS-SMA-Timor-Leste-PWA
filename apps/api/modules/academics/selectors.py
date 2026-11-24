"""Shared academic read helpers and scope primitives (PRD §7.2, §65.1, F2-13)."""

from django.db.models import Q
from django.utils import timezone

from .models import AcademicYear, ClassRoom, TeachingAssignment, Trimester


def current_year():
    return AcademicYear.objects.filter(is_current=True).first()


def current_trimester(year=None):
    year = year or current_year()
    if not year:
        return None
    return Trimester.objects.filter(academic_year=year, status=Trimester.Status.ACTIVE).first()


def teacher_of(user):
    return getattr(user, "teacher_profile", None) if user and user.is_authenticated else None


def active_assignments(teacher, *, on_date=None):
    on_date = on_date or timezone.localdate()
    return TeachingAssignment.objects.filter(teacher=teacher, active=True).filter(
        Q(valid_from__isnull=True) | Q(valid_from__lte=on_date), Q(valid_until__isnull=True) | Q(valid_until__gte=on_date)
    )


def teaching_classroom_ids(user):
    teacher = teacher_of(user)
    if not teacher:
        return set()
    return set(active_assignments(teacher).values_list("classroom_id", flat=True))


def homeroom_classroom_ids(user, year=None):
    teacher = teacher_of(user)
    if not teacher:
        return set()
    qs = ClassRoom.objects.filter(homeroom_teacher=teacher, active=True)
    if year is not None:
        qs = qs.filter(academic_year=year)
    else:
        qs = qs.filter(academic_year__status=AcademicYear.Status.ACTIVE)
    return set(qs.values_list("id", flat=True))


def apply_academic_filters(qs, params, *, prefix=""):
    """Canonical filter names (PRD §46.5): academic_year_id, trimester_id, grade_level_id, major_id, classroom_id."""
    mapping = {
        "academic_year_id": "academic_year_id",
        "grade_level_id": "grade_level_id",
        "major_id": "major_id",
        "classroom_id": "classroom_id",
        "trimester_id": "trimester_id",
    }
    for param, field in mapping.items():
        if value := params.get(param):
            qs = qs.filter(**{f"{prefix}{field}": value})
    return qs

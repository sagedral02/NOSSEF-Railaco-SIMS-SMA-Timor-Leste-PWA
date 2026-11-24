"""Finance read scope (PRD §25.10, F9-19): finance.view holders see all; guardians see linked children; students see
themselves. Teachers never see finance."""

from common.permissions import user_has_global
from modules.students.models import Student


def finance_students(user):
    if user_has_global(user, "finance.view"):
        return Student.objects.all()
    profile = getattr(user, "guardian_profile", None)
    qs = Student.objects.filter(user=user)
    if profile is not None:
        qs = qs | Student.objects.filter(guardian_links__guardian=profile, guardian_links__active=True)
    return qs.distinct()


def is_portal(user):
    return not user_has_global(user, "finance.view")

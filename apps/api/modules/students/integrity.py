"""Student integrity checks (PRD §54 INT-005, INT-006)."""

from django.db.models import Count, F, Q

from .models import StudentEnrollment


def int_005_single_active_enrollment():
    dup = (
        StudentEnrollment.objects.filter(status="ACTIVE").values("student", "academic_year").annotate(n=Count("id")).filter(n__gt=1).count()
    )
    return "INT-005", dup == 0, f"students with >1 ACTIVE enrollment in a year: {dup}"


def int_006_enrollment_matches_classroom():
    bad = StudentEnrollment.objects.filter(
        ~Q(classroom__academic_year=F("academic_year")) | ~Q(classroom__grade_level=F("grade_level")) | ~Q(classroom__major=F("major"))
    ).count()
    return "INT-006", bad == 0, f"enrollments not matching classroom: {bad}"

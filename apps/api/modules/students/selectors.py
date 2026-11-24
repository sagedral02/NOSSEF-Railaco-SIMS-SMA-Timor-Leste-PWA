"""Object-scoped student reads (PRD §7.2, §65.1). Never fetch a student by id without applying scope first."""

from django.db.models import Prefetch, Q

from common.permissions import user_has_global, user_has_perm
from modules.academics.models import AcademicYear
from modules.academics.selectors import homeroom_classroom_ids, teaching_classroom_ids

from .models import EnrollmentStatus, Student, StudentEnrollment, StudentGuardian


def staff_classroom_ids(user):
    return teaching_classroom_ids(user) | homeroom_classroom_ids(user)


def students_visible_to(user, perm="student.view"):
    qs = Student.objects.all()
    if user_has_global(user, perm):
        return qs
    cond = Q(pk__in=[])
    if user_has_perm(user, perm):
        classrooms = staff_classroom_ids(user)
        if classrooms:
            cond |= Q(enrollments__classroom_id__in=classrooms, enrollments__status=EnrollmentStatus.ACTIVE)
    profile = getattr(user, "guardian_profile", None)
    if profile is not None:
        cond |= Q(guardian_links__guardian=profile, guardian_links__active=True)
    cond |= Q(user=user)
    return qs.filter(cond).distinct()


def active_enrollment_prefetch(year=None):
    qs = StudentEnrollment.objects.filter(status=EnrollmentStatus.ACTIVE).select_related(
        "classroom", "grade_level", "major", "academic_year"
    )
    if year is not None:
        qs = qs.filter(academic_year=year)
    else:
        qs = qs.order_by("-academic_year__start_date")
    return Prefetch("enrollments", queryset=qs, to_attr="active_enrollments")


def current_enrollment(student):
    links = getattr(student, "active_enrollments", None)
    if links is not None:
        return links[0] if links else None
    return (
        student.enrollments.filter(status=EnrollmentStatus.ACTIVE)
        .select_related("classroom", "grade_level", "major", "academic_year")
        .order_by("-academic_year__start_date")
        .first()
    )


def guardian_links(student):
    return (
        StudentGuardian.objects.filter(student=student, active=True)
        .select_related("guardian")
        .order_by("-is_primary", "guardian__full_name")
    )


def current_year_classroom_students(classroom):
    return Student.objects.filter(enrollments__classroom=classroom, enrollments__status=EnrollmentStatus.ACTIVE).order_by("full_name")


def is_active_year(year):
    return year.status == AcademicYear.Status.ACTIVE

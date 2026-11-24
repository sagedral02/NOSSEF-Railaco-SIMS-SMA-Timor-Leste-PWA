"""Attendance integrity checks (PRD §54 INT-009, INT-010)."""

from django.db.models import Count, Exists, OuterRef, Q

from modules.students.models import StudentEnrollment

from .models import AttendanceRecord


def int_009_attendance_student_enrolled():
    enrolled = StudentEnrollment.objects.filter(
        student=OuterRef("student"), classroom=OuterRef("session__classroom"), start_date__lte=OuterRef("session__date")
    ).filter(Q(end_date__isnull=True) | Q(end_date__gte=OuterRef("session__date")))
    bad = AttendanceRecord.objects.annotate(ok=Exists(enrolled)).filter(ok=False).count()
    return "INT-009", bad == 0, f"attendance records for students not enrolled on the session date: {bad}"


def int_010_unique_attendance_record():
    dup = AttendanceRecord.objects.values("session", "student").annotate(n=Count("id")).filter(n__gt=1).count()
    return "INT-010", dup == 0, f"duplicate session+student records: {dup}"

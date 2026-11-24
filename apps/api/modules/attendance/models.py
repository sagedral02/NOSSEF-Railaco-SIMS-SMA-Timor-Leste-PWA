"""Student/staff attendance, corrections, leave and offline receipts (PRD §15.31–§15.36, §20, §21, ADR-008)."""

import uuid

from django.conf import settings
from django.db import models
from django.db.models import F, Q

from common.models import BaseModel


class AttendanceStatus(models.TextChoices):
    PRESENT = "PRESENT", "Present"
    SICK = "SICK", "Sick"
    PERMITTED = "PERMITTED", "Permitted"
    ABSENT = "ABSENT", "Absent"
    LATE = "LATE", "Late"


class AttendanceSession(BaseModel):
    class SessionType(models.TextChoices):
        DAILY = "DAILY", "Daily"
        LESSON = "LESSON", "Lesson"

    class Status(models.TextChoices):
        OPEN = "OPEN", "Open"
        SUBMITTED = "SUBMITTED", "Submitted"
        LOCKED = "LOCKED", "Locked"

    academic_year = models.ForeignKey("academics.AcademicYear", on_delete=models.PROTECT, related_name="attendance_sessions")
    trimester = models.ForeignKey("academics.Trimester", on_delete=models.PROTECT, related_name="attendance_sessions")
    classroom = models.ForeignKey("academics.ClassRoom", on_delete=models.PROTECT, related_name="attendance_sessions")
    date = models.DateField()
    session_type = models.CharField(max_length=6, choices=SessionType.choices)
    schedule_entry = models.ForeignKey(
        "schedules.ScheduleEntry", null=True, blank=True, on_delete=models.PROTECT, related_name="attendance_sessions"
    )
    teaching_assignment = models.ForeignKey(
        "academics.TeachingAssignment", null=True, blank=True, on_delete=models.PROTECT, related_name="attendance_sessions"
    )
    opened_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.OPEN)
    version = models.PositiveIntegerField(default=1)
    submitted_at = models.DateTimeField(null=True, blank=True)
    locked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-date", "classroom__code")
        constraints = [
            models.UniqueConstraint(fields=["classroom", "date"], condition=Q(session_type="DAILY"), name="attendance_daily_unique"),
            models.UniqueConstraint(fields=["schedule_entry", "date"], condition=Q(session_type="LESSON"), name="attendance_lesson_unique"),
            models.CheckConstraint(condition=Q(version__gte=1), name="attendance_session_version_positive"),
            models.CheckConstraint(
                condition=Q(session_type="DAILY") | (Q(schedule_entry__isnull=False) & Q(teaching_assignment__isnull=False)),
                name="attendance_lesson_requires_schedule",
            ),
        ]
        indexes = [models.Index(fields=["classroom", "date"]), models.Index(fields=["status"])]

    def __str__(self):
        return f"{self.classroom} {self.date} {self.session_type}"


class AttendanceRecord(BaseModel):
    session = models.ForeignKey(AttendanceSession, on_delete=models.CASCADE, related_name="records")
    student = models.ForeignKey("students.Student", on_delete=models.PROTECT, related_name="attendance_records")
    status = models.CharField(max_length=10, choices=AttendanceStatus.choices)
    minutes_late = models.PositiveSmallIntegerField(null=True, blank=True)
    note = models.TextField(blank=True, default="")
    recorded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    version = models.PositiveIntegerField(default=1)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["session", "student"], name="attendance_record_unique"),
            models.CheckConstraint(
                condition=(Q(status="LATE") & Q(minutes_late__isnull=False) & Q(minutes_late__gt=0))
                | (~Q(status="LATE") & Q(minutes_late__isnull=True)),
                name="attendance_late_minutes_rule",
            ),
        ]
        indexes = [models.Index(fields=["student"]), models.Index(fields=["session"]), models.Index(fields=["status"])]

    def __str__(self):
        return f"{self.student_id} {self.status}"


class AttendanceCorrection(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    attendance_record = models.ForeignKey(AttendanceRecord, on_delete=models.PROTECT, related_name="corrections")
    from_status = models.CharField(max_length=10, choices=AttendanceStatus.choices)
    to_status = models.CharField(max_length=10, choices=AttendanceStatus.choices)
    reason = models.TextField()
    requested_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)
        constraints = [models.CheckConstraint(condition=~Q(reason=""), name="attendance_correction_reason_required")]
        indexes = [models.Index(fields=["attendance_record", "created_at"])]

    def __str__(self):
        return f"{self.attendance_record_id} {self.from_status}->{self.to_status}"

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise PermissionError("AttendanceCorrection is append-only.")
        super().save(*args, **kwargs)


class StudentLeaveRequest(BaseModel):
    class LeaveType(models.TextChoices):
        SICK = "SICK", "Sick"
        PERMITTED = "PERMITTED", "Permitted"
        OTHER = "OTHER", "Other"

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"
        CANCELLED = "CANCELLED", "Cancelled"

    student = models.ForeignKey("students.Student", on_delete=models.PROTECT, related_name="leave_requests")
    start_date = models.DateField()
    end_date = models.DateField()
    leave_type = models.CharField(max_length=10, choices=LeaveType.choices)
    reason = models.TextField()
    supporting_file = models.ForeignKey("documents.StoredFile", null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    requested_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    review_note = models.TextField(blank=True, default="")

    class Meta:
        ordering = ("-start_date",)
        constraints = [models.CheckConstraint(condition=Q(start_date__lte=F("end_date")), name="attendance_leave_dates")]
        indexes = [models.Index(fields=["student", "start_date"]), models.Index(fields=["status"])]

    def __str__(self):
        return f"{self.student_id} {self.start_date}..{self.end_date}"


class StaffAttendance(BaseModel):
    class PersonType(models.TextChoices):
        TEACHER = "TEACHER", "Teacher"
        STAFF = "STAFF", "Staff"

    person_type = models.CharField(max_length=8, choices=PersonType.choices)
    teacher = models.ForeignKey("staff.Teacher", null=True, blank=True, on_delete=models.PROTECT, related_name="attendance")
    staff = models.ForeignKey("staff.StaffProfile", null=True, blank=True, on_delete=models.PROTECT, related_name="attendance")
    date = models.DateField()
    status = models.CharField(max_length=10, choices=AttendanceStatus.choices)
    check_in_at = models.DateTimeField(null=True, blank=True)
    check_out_at = models.DateTimeField(null=True, blank=True)
    note = models.TextField(blank=True, default="")
    recorded_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+")

    class Meta:
        ordering = ("-date",)
        constraints = [
            models.CheckConstraint(
                condition=(Q(person_type="TEACHER") & Q(teacher__isnull=False) & Q(staff__isnull=True))
                | (Q(person_type="STAFF") & Q(staff__isnull=False) & Q(teacher__isnull=True)),
                name="attendance_staff_exactly_one_person",
            ),
            models.UniqueConstraint(fields=["teacher", "date"], condition=Q(teacher__isnull=False), name="attendance_teacher_date_unique"),
            models.UniqueConstraint(fields=["staff", "date"], condition=Q(staff__isnull=False), name="attendance_staff_date_unique"),
        ]
        indexes = [models.Index(fields=["date"]), models.Index(fields=["status"])]

    def __str__(self):
        return f"{self.person_type} {self.date} {self.status}"


class OfflineMutationReceipt(models.Model):
    class Result(models.TextChoices):
        APPLIED = "APPLIED", "Applied"
        DUPLICATE = "DUPLICATE", "Duplicate"
        CONFLICT = "CONFLICT", "Conflict"
        REJECTED = "REJECTED", "Rejected"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    mutation_id = models.UUIDField()
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    device_id = models.CharField(max_length=100)
    mutation_type = models.CharField(max_length=80)
    request_hash = models.CharField(max_length=64)
    resource_id = models.UUIDField(null=True, blank=True)
    result_status = models.CharField(max_length=10, choices=Result.choices)
    processed_at = models.DateTimeField(auto_now_add=True)
    response_snapshot = models.JSONField(null=True, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["user", "mutation_id"], name="attendance_receipt_unique_mutation")]
        indexes = [models.Index(fields=["user", "processed_at"])]

    def __str__(self):
        return f"{self.mutation_id} {self.result_status}"

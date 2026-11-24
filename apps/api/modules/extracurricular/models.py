"""Extracurricular activities (PRD §15.62–§15.64, §27). Membership statuses follow §27.1
(ACTIVE/WAITLIST/WITHDRAWN/COMPLETED); withdrawals keep history (no hard delete)."""

from django.db import models
from django.db.models import F, Q

from common.models import BaseModel


class ExtracurricularActivity(BaseModel):
    # NOSSEF program units (ui.md SCREEN-15); a display grouping only, no business rule depends on it.
    class Category(models.TextChoices):
        LEADERSHIP = "LEADERSHIP", "Student leadership (KORENOSSEF)"
        PASTORAL = "PASTORAL", "School pastoral team"
        DRUM_BAND = "DRUM_BAND", "Drum band / Fanfarra"
        SPORTS = "SPORTS", "Sports"
        ACADEMIC = "ACADEMIC", "Academic club"
        OTHER = "OTHER", "Other"

    academic_year = models.ForeignKey("academics.AcademicYear", on_delete=models.PROTECT, related_name="activities")
    name = models.CharField(max_length=150)
    category = models.CharField(max_length=12, choices=Category.choices, default=Category.OTHER)
    description = models.TextField(blank=True, default="")
    schedule_text = models.CharField(max_length=200, blank=True, default="")
    advisor_teacher = models.ForeignKey("staff.Teacher", null=True, blank=True, on_delete=models.PROTECT, related_name="activities")
    capacity = models.PositiveIntegerField(null=True, blank=True)
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ("name",)
        indexes = [models.Index(fields=["academic_year", "active"])]
        constraints = [models.UniqueConstraint(fields=["academic_year", "name"], name="extracurricular_unique_name_per_year")]

    def __str__(self):
        return self.name


class ExtracurricularMembership(BaseModel):
    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Active"
        WAITLIST = "WAITLIST", "Waitlist"
        WITHDRAWN = "WITHDRAWN", "Withdrawn"
        COMPLETED = "COMPLETED", "Completed"

    activity = models.ForeignKey(ExtracurricularActivity, on_delete=models.PROTECT, related_name="memberships")
    student = models.ForeignKey("students.Student", on_delete=models.PROTECT, related_name="activity_memberships")
    joined_at = models.DateField()
    left_at = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ACTIVE)
    role = models.CharField(max_length=60, blank=True, default="")
    note = models.TextField(blank=True, default="")  # achievements / simple notes (§27.1)

    class Meta:
        ordering = ("activity", "student__full_name")
        indexes = [models.Index(fields=["student", "status"])]
        constraints = [
            models.UniqueConstraint(
                fields=["activity", "student"], condition=Q(status__in=["ACTIVE", "WAITLIST"]), name="extracurricular_one_open_membership"
            ),
            models.CheckConstraint(
                condition=Q(left_at__isnull=True) | Q(left_at__gte=F("joined_at")), name="extracurricular_membership_range"
            ),
        ]


class ExtracurricularAttendance(BaseModel):
    class Status(models.TextChoices):
        PRESENT = "PRESENT", "Present"
        ABSENT = "ABSENT", "Absent"
        PERMITTED = "PERMITTED", "Permitted"

    activity = models.ForeignKey(ExtracurricularActivity, on_delete=models.PROTECT, related_name="attendance")
    student = models.ForeignKey("students.Student", on_delete=models.PROTECT, related_name="+")
    date = models.DateField()
    status = models.CharField(max_length=10, choices=Status.choices)
    note = models.TextField(blank=True, default="")

    class Meta:
        indexes = [models.Index(fields=["activity", "date"])]
        constraints = [models.UniqueConstraint(fields=["activity", "student", "date"], name="extracurricular_unique_attendance")]

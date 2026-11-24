"""BK counseling and discipline (PRD §15.59–§15.61, §26). Counseling detail is RESTRICTED; discipline incidents are never
deleted (VOID + reason). Extensions required by §26.2/§26.3: guardian communication log, evidence files, incident
location/action type, VOID status and an explicitly published guardian notice."""

from django.conf import settings
from django.db import models
from django.db.models import Q

from common.models import BaseModel


class Severity(models.TextChoices):
    LOW = "LOW", "Low"
    MEDIUM = "MEDIUM", "Medium"
    HIGH = "HIGH", "High"
    CRITICAL = "CRITICAL", "Critical"


class CounselingCase(BaseModel):
    class Status(models.TextChoices):
        OPEN = "OPEN", "Open"
        IN_PROGRESS = "IN_PROGRESS", "In progress"
        RESOLVED = "RESOLVED", "Resolved"
        CLOSED = "CLOSED", "Closed"

    student = models.ForeignKey("students.Student", on_delete=models.PROTECT, related_name="counseling_cases")
    case_no = models.CharField(max_length=50, unique=True)
    category = models.CharField(max_length=100)
    severity = models.CharField(max_length=8, choices=Severity.choices)
    summary = models.CharField(max_length=250)
    details = models.TextField(blank=True, default="")
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.OPEN)
    assigned_counselor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    opened_at = models.DateTimeField()
    closed_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    reopen_reason = models.TextField(blank=True, default="")
    version = models.PositiveIntegerField(default=1)

    class Meta:
        ordering = ("-opened_at",)
        indexes = [models.Index(fields=["student", "status"]), models.Index(fields=["assigned_counselor"])]
        constraints = [
            models.CheckConstraint(condition=~Q(status="CLOSED") | Q(closed_at__isnull=False), name="counseling_closed_has_date")
        ]

    def __str__(self):
        return self.case_no


class CounselingFollowUp(BaseModel):
    """Append-only (no update/delete endpoints)."""

    case = models.ForeignKey(CounselingCase, on_delete=models.PROTECT, related_name="follow_ups")
    follow_up_at = models.DateTimeField()
    note = models.TextField()
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    next_action_at = models.DateTimeField(null=True, blank=True)
    evidence_file = models.ForeignKey("documents.StoredFile", null=True, blank=True, on_delete=models.PROTECT, related_name="+")

    class Meta:
        ordering = ("follow_up_at",)
        indexes = [models.Index(fields=["case", "follow_up_at"])]


class GuardianContact(BaseModel):
    """Guardian communication record (§26.2: date, channel, summary, actor)."""

    class Channel(models.TextChoices):
        PHONE = "PHONE", "Phone"
        MEETING = "MEETING", "Meeting"
        LETTER = "LETTER", "Letter"
        MESSAGE = "MESSAGE", "Message"
        OTHER = "OTHER", "Other"

    case = models.ForeignKey(CounselingCase, null=True, blank=True, on_delete=models.PROTECT, related_name="guardian_contacts")
    incident = models.ForeignKey("DisciplineIncident", null=True, blank=True, on_delete=models.PROTECT, related_name="guardian_contacts")
    contacted_at = models.DateTimeField()
    channel = models.CharField(max_length=8, choices=Channel.choices)
    summary = models.CharField(max_length=500)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")

    class Meta:
        ordering = ("-contacted_at",)
        constraints = [
            models.CheckConstraint(condition=Q(case__isnull=False) | Q(incident__isnull=False), name="counseling_contact_has_subject")
        ]


class DisciplineIncident(BaseModel):
    class Status(models.TextChoices):
        OPEN = "OPEN", "Open"
        RESOLVED = "RESOLVED", "Resolved"
        VOID = "VOID", "Void"

    class Action(models.TextChoices):
        NONE = "NONE", "None yet"
        WARNING = "WARNING", "Warning"
        COUNSELING_REFERRAL = "COUNSELING_REFERRAL", "Counseling referral"
        PARENT_MEETING = "PARENT_MEETING", "Parent meeting"
        OTHER = "OTHER", "Other"

    student = models.ForeignKey("students.Student", on_delete=models.PROTECT, related_name="discipline_incidents")
    occurred_at = models.DateTimeField()
    location = models.CharField(max_length=150, blank=True, default="")
    category = models.CharField(max_length=100)
    severity = models.CharField(max_length=8, choices=Severity.choices)
    description = models.TextField()
    reported_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    action_type = models.CharField(max_length=20, choices=Action.choices, default=Action.NONE)
    action_taken = models.TextField(blank=True, default="")
    status = models.CharField(max_length=8, choices=Status.choices, default=Status.OPEN)
    void_reason = models.TextField(blank=True, default="")
    referred_case = models.ForeignKey(CounselingCase, null=True, blank=True, on_delete=models.PROTECT, related_name="referrals")
    guardian_notice = models.TextField(blank=True, default="")
    guardian_notified_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-occurred_at",)
        indexes = [models.Index(fields=["student", "occurred_at"]), models.Index(fields=["status"])]
        constraints = [models.CheckConstraint(condition=~Q(status="VOID") | ~Q(void_reason=""), name="discipline_void_has_reason")]

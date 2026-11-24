"""Admissions (PRD §15.18–§15.22, §16).

Additions documented in docs/adr/017-admissions.md:
- AdmissionPeriod.required_documents: configurable required document types per period (PRD §16.2, §60.1).
- Applicant.access_token_hash: secret for the public applicant flow; registration numbers carry a random part
  so status lookup cannot be enumerated (PRD §16.5).
- Applicant.student: link set atomically at enrollment, making enrollment replay idempotent.
"""

from django.conf import settings
from django.contrib.postgres.fields import ArrayField
from django.db import models
from django.db.models import F, Q

from common.models import BaseModel
from modules.staff.models import Gender
from modules.students.models import Relationship

DOCUMENT_TYPES = {
    "BIRTH_CERTIFICATE": "Akta/Sertidaun Moris",
    "PREVIOUS_CERTIFICATE": "Ijazah Pre-Secundária",
    "REPORT_CARD": "Rapor Terakhir",
    "ID_PHOTO": "Pas Foto",
    "BAPTISM_CERTIFICATE": "Sertidaun Batizmu",
    "GUARDIAN_ID": "Identitas Wali",
    "OTHER": "Lainnya",
}
DEFAULT_REQUIRED = ["BIRTH_CERTIFICATE", "PREVIOUS_CERTIFICATE", "ID_PHOTO"]


class AdmissionPeriod(BaseModel):
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        OPEN = "OPEN", "Open"
        CLOSED = "CLOSED", "Closed"
        DECISION = "DECISION", "Decision published"
        COMPLETED = "COMPLETED", "Completed"

    academic_year = models.ForeignKey("academics.AcademicYear", on_delete=models.PROTECT, related_name="admission_periods")
    name = models.CharField(max_length=150)
    registration_start = models.DateTimeField()
    registration_end = models.DateTimeField()
    capacity_total = models.PositiveIntegerField(null=True, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    required_documents = ArrayField(models.CharField(max_length=50), default=list, blank=True)

    class Meta:
        ordering = ("-registration_start",)
        constraints = [models.CheckConstraint(condition=Q(registration_start__lt=F("registration_end")), name="admissions_period_window")]
        indexes = [models.Index(fields=["academic_year", "status"])]

    def __str__(self):
        return self.name


class ApplicantStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    SUBMITTED = "SUBMITTED", "Submitted"
    VERIFIED = "VERIFIED", "Verified"
    ELIGIBLE = "ELIGIBLE", "Eligible"
    ACCEPTED = "ACCEPTED", "Accepted"
    WAITING_LIST = "WAITING_LIST", "Waiting list"
    REJECTED = "REJECTED", "Rejected"
    RE_REGISTERED = "RE_REGISTERED", "Re-registered"
    ENROLLED = "ENROLLED", "Enrolled"


class Applicant(BaseModel):
    admission_period = models.ForeignKey(AdmissionPeriod, on_delete=models.PROTECT, related_name="applicants")
    registration_no = models.CharField(max_length=50, unique=True)
    full_name = models.CharField(max_length=200)
    birth_place = models.CharField(max_length=100, blank=True, default="")
    birth_date = models.DateField()
    gender = models.CharField(max_length=1, choices=Gender.choices, blank=True, default="")
    previous_school = models.CharField(max_length=200, blank=True, default="")
    phone = models.CharField(max_length=50, blank=True, default="")
    email = models.EmailField(blank=True, default="")
    address = models.TextField(blank=True, default="")
    desired_major = models.ForeignKey("academics.Major", null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    status = models.CharField(max_length=14, choices=ApplicantStatus.choices, default=ApplicantStatus.DRAFT)
    submitted_at = models.DateTimeField(null=True, blank=True)
    re_registered_at = models.DateTimeField(null=True, blank=True)
    access_token_hash = models.CharField(max_length=64, blank=True, default="")
    student = models.OneToOneField("students.Student", null=True, blank=True, on_delete=models.PROTECT, related_name="applicant")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+")

    class Meta:
        ordering = ("-created_at",)
        indexes = [models.Index(fields=["admission_period", "status"]), models.Index(fields=["full_name"])]

    def __str__(self):
        return f"{self.registration_no} {self.full_name}"


class ApplicantGuardian(BaseModel):
    applicant = models.ForeignKey(Applicant, on_delete=models.CASCADE, related_name="guardians")
    full_name = models.CharField(max_length=200)
    relationship = models.CharField(max_length=10, choices=Relationship.choices)
    phone = models.CharField(max_length=50, blank=True, default="")
    email = models.EmailField(blank=True, default="")
    occupation = models.CharField(max_length=150, blank=True, default="")
    address = models.TextField(blank=True, default="")
    is_primary = models.BooleanField(default=False)

    class Meta:
        ordering = ("-is_primary", "full_name")
        constraints = [
            models.UniqueConstraint(fields=["applicant"], condition=Q(is_primary=True), name="admissions_single_primary_guardian")
        ]
        indexes = [models.Index(fields=["applicant", "is_primary"])]

    def __str__(self):
        return self.full_name


class ApplicantDocument(BaseModel):
    class Verification(models.TextChoices):
        PENDING = "PENDING", "Pending"
        VALID = "VALID", "Valid"
        INVALID = "INVALID", "Invalid"

    applicant = models.ForeignKey(Applicant, on_delete=models.CASCADE, related_name="documents")
    document_type = models.CharField(max_length=50)
    file = models.ForeignKey("documents.StoredFile", on_delete=models.PROTECT, related_name="+")
    verification_status = models.CharField(max_length=8, choices=Verification.choices, default=Verification.PENDING)
    verified_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    verified_at = models.DateTimeField(null=True, blank=True)
    note = models.TextField(blank=True, default="")
    # Replaced documents stay as history (PRD §31.1: no silent replacement).
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ("document_type", "-created_at")
        constraints = [
            models.UniqueConstraint(
                fields=["applicant", "document_type"], condition=Q(active=True), name="admissions_single_active_document"
            ),
        ]
        indexes = [models.Index(fields=["applicant", "document_type"]), models.Index(fields=["verification_status"])]

    def __str__(self):
        return f"{self.applicant_id} {self.document_type}"


class AdmissionDecision(BaseModel):
    class Decision(models.TextChoices):
        ACCEPTED = "ACCEPTED", "Accepted"
        WAITING_LIST = "WAITING_LIST", "Waiting list"
        REJECTED = "REJECTED", "Rejected"

    applicant = models.OneToOneField(Applicant, on_delete=models.PROTECT, related_name="decision")
    decision = models.CharField(max_length=12, choices=Decision.choices)
    score = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    rank = models.PositiveIntegerField(null=True, blank=True)
    decided_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    decided_at = models.DateTimeField()
    note = models.TextField(blank=True, default="")

    class Meta:
        indexes = [models.Index(fields=["decision"]), models.Index(fields=["rank"])]

    def __str__(self):
        return f"{self.applicant_id} {self.decision}"

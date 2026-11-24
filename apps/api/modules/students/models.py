"""Students, guardians, historical enrollment, status history, transfers (PRD §15.23–§15.28, §17, ADR-006).

INV-06: placement history lives in StudentEnrollment; Student has no current-class field.
INV-07: at most one ACTIVE enrollment per student per academic year (partial unique constraint).
INV-08: enrollment grade/major/year must match the classroom (clean() + service check).
INV-17: guardian access requires an active StudentGuardian link.
"""

import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import F, Q

from common.models import BaseModel
from modules.staff.models import Gender


class StudentStatus(models.TextChoices):
    ACTIVE = "ACTIVE", "Active"
    GRADUATED = "GRADUATED", "Graduated"
    TRANSFERRED = "TRANSFERRED", "Transferred"
    LEFT = "LEFT", "Left"
    INACTIVE = "INACTIVE", "Inactive"


class Student(BaseModel):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="student_profile")
    student_no = models.CharField(max_length=50, unique=True)
    national_student_no = models.CharField(max_length=80, null=True, blank=True)
    full_name = models.CharField(max_length=200)
    birth_place = models.CharField(max_length=100, blank=True, default="")
    birth_date = models.DateField()
    gender = models.CharField(max_length=1, choices=Gender.choices, blank=True, default="")
    address = models.TextField(blank=True, default="")
    phone = models.CharField(max_length=50, blank=True, default="")
    email = models.EmailField(blank=True, default="")
    photo_file = models.ForeignKey("documents.StoredFile", null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    admission_date = models.DateField()
    status = models.CharField(max_length=12, choices=StudentStatus.choices, default=StudentStatus.ACTIVE)

    class Meta:
        ordering = ("full_name",)
        constraints = [
            models.UniqueConstraint(
                fields=["national_student_no"], condition=Q(national_student_no__isnull=False), name="students_national_no_unique"
            ),
        ]
        indexes = [models.Index(fields=["status"]), models.Index(fields=["full_name"])]

    def __str__(self):
        return f"{self.student_no} {self.full_name}"

    def save(self, *args, **kwargs):
        self.national_student_no = (self.national_student_no or "").strip() or None
        super().save(*args, **kwargs)


class Relationship(models.TextChoices):
    FATHER = "FATHER", "Father"
    MOTHER = "MOTHER", "Mother"
    GUARDIAN = "GUARDIAN", "Guardian"
    OTHER = "OTHER", "Other"


class Guardian(BaseModel):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="guardian_profile")
    full_name = models.CharField(max_length=200)
    phone = models.CharField(max_length=50, blank=True, default="")
    email = models.EmailField(blank=True, default="")
    address = models.TextField(blank=True, default="")
    occupation = models.CharField(max_length=150, blank=True, default="")
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ("full_name",)
        indexes = [models.Index(fields=["full_name"]), models.Index(fields=["phone"])]

    def __str__(self):
        return self.full_name


class StudentGuardian(BaseModel):
    student = models.ForeignKey(Student, on_delete=models.PROTECT, related_name="guardian_links")
    guardian = models.ForeignKey(Guardian, on_delete=models.PROTECT, related_name="student_links")
    relationship = models.CharField(max_length=10, choices=Relationship.choices)
    is_primary = models.BooleanField(default=False)
    receives_notifications = models.BooleanField(default=True)
    financial_contact = models.BooleanField(default=False)
    active = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["student", "guardian"], condition=Q(active=True), name="students_guardian_link_unique_active"),
            models.UniqueConstraint(fields=["student"], condition=Q(active=True, is_primary=True), name="students_single_primary_guardian"),
        ]
        indexes = [models.Index(fields=["student", "active"]), models.Index(fields=["guardian", "active"])]

    def __str__(self):
        return f"{self.guardian} → {self.student}"


class EnrollmentStatus(models.TextChoices):
    ACTIVE = "ACTIVE", "Active"
    PROMOTED = "PROMOTED", "Promoted"
    REPEATED = "REPEATED", "Repeated"
    TRANSFERRED = "TRANSFERRED", "Transferred"
    COMPLETED = "COMPLETED", "Completed"
    CANCELLED = "CANCELLED", "Cancelled"


class EnrollmentSource(models.TextChoices):
    ADMISSION = "ADMISSION", "Admission"
    PROMOTION = "PROMOTION", "Promotion"
    TRANSFER = "TRANSFER", "Transfer"
    MANUAL = "MANUAL", "Manual"


class StudentEnrollment(BaseModel):
    student = models.ForeignKey(Student, on_delete=models.PROTECT, related_name="enrollments")
    academic_year = models.ForeignKey("academics.AcademicYear", on_delete=models.PROTECT, related_name="enrollments")
    grade_level = models.ForeignKey("academics.GradeLevel", on_delete=models.PROTECT, related_name="enrollments")
    major = models.ForeignKey("academics.Major", on_delete=models.PROTECT, related_name="enrollments")
    classroom = models.ForeignKey("academics.ClassRoom", on_delete=models.PROTECT, related_name="enrollments")
    status = models.CharField(max_length=12, choices=EnrollmentStatus.choices, default=EnrollmentStatus.ACTIVE)
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    source = models.CharField(max_length=10, choices=EnrollmentSource.choices)

    class Meta:
        ordering = ("-academic_year__start_date", "-start_date")
        constraints = [
            models.UniqueConstraint(
                fields=["student", "academic_year"], condition=Q(status="ACTIVE"), name="students_single_active_enrollment"
            ),
            models.CheckConstraint(condition=Q(end_date__isnull=True) | Q(end_date__gte=F("start_date")), name="students_enrollment_dates"),
        ]
        indexes = [
            models.Index(fields=["student", "academic_year"]),
            models.Index(fields=["classroom", "status"]),
            models.Index(fields=["major"]),
        ]

    def __str__(self):
        return f"{self.student} {self.classroom} {self.status}"

    def clean(self):
        c = self.classroom if self.classroom_id else None
        if c and (c.academic_year_id != self.academic_year_id or c.grade_level_id != self.grade_level_id or c.major_id != self.major_id):
            raise ValidationError({"classroom": "Rombel tidak sesuai tahun/tingkat/jurusan enrollment (INV-08)."})


class StudentStatusHistory(models.Model):
    id = models.UUIDField(primary_key=True, editable=False, default=uuid.uuid4)
    student = models.ForeignKey(Student, on_delete=models.PROTECT, related_name="status_history")
    from_status = models.CharField(max_length=12, choices=StudentStatus.choices, blank=True, default="")
    to_status = models.CharField(max_length=12, choices=StudentStatus.choices)
    effective_date = models.DateField()
    reason = models.TextField(blank=True, default="")
    changed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.PROTECT, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-effective_date", "-created_at")
        indexes = [models.Index(fields=["student", "effective_date"])]

    def __str__(self):
        return f"{self.student_id} {self.from_status}->{self.to_status}"


class TransferType(models.TextChoices):
    IN = "IN", "Transfer in"
    OUT = "OUT", "Transfer out"
    INTERNAL_MAJOR = "INTERNAL_MAJOR", "Major change"
    INTERNAL_CLASS = "INTERNAL_CLASS", "Class change"


class StudentTransfer(BaseModel):
    student = models.ForeignKey(Student, on_delete=models.PROTECT, related_name="transfers")
    transfer_type = models.CharField(max_length=16, choices=TransferType.choices)
    effective_date = models.DateField()
    from_detail = models.JSONField(null=True, blank=True)
    to_detail = models.JSONField(null=True, blank=True)
    reason = models.TextField(blank=True, default="")
    document_file = models.ForeignKey("documents.StoredFile", null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+")

    class Meta:
        ordering = ("-effective_date", "-created_at")
        constraints = [
            models.CheckConstraint(
                condition=~Q(transfer_type__in=["INTERNAL_MAJOR", "OUT"]) | ~Q(reason=""), name="students_transfer_reason_required"
            ),
        ]
        indexes = [models.Index(fields=["student", "effective_date"]), models.Index(fields=["transfer_type"])]

    def __str__(self):
        return f"{self.student_id} {self.transfer_type}"

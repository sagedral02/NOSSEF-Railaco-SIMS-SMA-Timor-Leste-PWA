"""Report card snapshots, revisions and promotion decisions (PRD §15.44–§15.46, §23, ADR-012).

INV-11: a PUBLISHED report is an immutable snapshot; corrections create a new revision.
`snapshot` keeps identity/enrollment/school data as published (JSON snapshot, PRD §12). `verification_token`
backs the optional public QR verification (§23.1).
"""

import secrets

from django.conf import settings
from django.db import models
from django.db.models import Q

from common.models import BaseModel


def _token():
    return secrets.token_urlsafe(16)


class ReportCard(BaseModel):
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        REVIEWED = "REVIEWED", "Reviewed"
        PUBLISHED = "PUBLISHED", "Published"
        REOPENED = "REOPENED", "Reopened (superseded)"

    student = models.ForeignKey("students.Student", on_delete=models.PROTECT, related_name="report_cards")
    enrollment = models.ForeignKey("students.StudentEnrollment", on_delete=models.PROTECT, related_name="report_cards")
    trimester = models.ForeignKey("academics.Trimester", on_delete=models.PROTECT, related_name="report_cards")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    homeroom_note = models.TextField(blank=True, default="")
    attendance_summary = models.JSONField(default=dict)
    snapshot = models.JSONField(default=dict)
    published_at = models.DateTimeField(null=True, blank=True)
    published_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    revision_no = models.PositiveIntegerField(default=1)
    reopen_reason = models.TextField(blank=True, default="")
    pdf_file = models.ForeignKey("documents.StoredFile", null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    verification_token = models.CharField(max_length=40, default=_token, unique=True)

    class Meta:
        ordering = ("-trimester__start_date", "student__full_name", "-revision_no")
        constraints = [
            models.UniqueConstraint(fields=["student", "trimester", "revision_no"], name="report_cards_unique_revision"),
            models.UniqueConstraint(fields=["student", "trimester"], condition=Q(status="PUBLISHED"), name="report_cards_single_published"),
            models.UniqueConstraint(
                fields=["student", "trimester"], condition=Q(status__in=["DRAFT", "REVIEWED"]), name="report_cards_single_working"
            ),
        ]
        indexes = [models.Index(fields=["student", "trimester"]), models.Index(fields=["status"])]

    def __str__(self):
        return f"{self.student_id} T{self.trimester_id} r{self.revision_no} {self.status}"


class ReportCardSubject(BaseModel):
    report_card = models.ForeignKey(ReportCard, on_delete=models.CASCADE, related_name="subjects")
    subject = models.ForeignKey("academics.Subject", on_delete=models.PROTECT, related_name="+")
    term_grade = models.ForeignKey("assessments.TermGrade", on_delete=models.PROTECT, related_name="report_rows")
    final_score = models.DecimalField(max_digits=7, decimal_places=4)
    grade_label = models.CharField(max_length=20, blank=True, default="")
    cau_score = models.DecimalField(max_digits=7, decimal_places=4, null=True, blank=True)
    teacher_note = models.TextField(blank=True, default="")
    sequence = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ("sequence", "subject__code")
        constraints = [models.UniqueConstraint(fields=["report_card", "subject"], name="report_cards_unique_subject")]
        indexes = [models.Index(fields=["report_card"])]

    def __str__(self):
        return f"{self.report_card_id} {self.subject_id} {self.final_score}"


class PromotionDecision(BaseModel):
    class Decision(models.TextChoices):
        PROMOTED = "PROMOTED", "Promoted"
        REPEATED = "REPEATED", "Repeated"
        GRADUATED = "GRADUATED", "Graduated"
        TRANSFERRED = "TRANSFERRED", "Transferred"

    student = models.ForeignKey("students.Student", on_delete=models.PROTECT, related_name="promotion_decisions")
    academic_year = models.ForeignKey("academics.AcademicYear", on_delete=models.PROTECT, related_name="promotion_decisions")
    decision = models.CharField(max_length=12, choices=Decision.choices)
    from_enrollment = models.ForeignKey("students.StudentEnrollment", on_delete=models.PROTECT, related_name="promotion_from")
    to_enrollment = models.ForeignKey(
        "students.StudentEnrollment", null=True, blank=True, on_delete=models.PROTECT, related_name="promotion_to"
    )
    target_grade_level = models.ForeignKey("academics.GradeLevel", null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    target_major = models.ForeignKey("academics.Major", null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    target_classroom = models.ForeignKey("academics.ClassRoom", null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    reason = models.TextField(blank=True, default="")
    override_incomplete = models.BooleanField(default=False)
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")

    class Meta:
        constraints = [models.UniqueConstraint(fields=["student", "academic_year"], name="report_cards_single_promotion_decision")]
        indexes = [models.Index(fields=["academic_year", "decision"])]

    def __str__(self):
        return f"{self.student_id} {self.decision}"

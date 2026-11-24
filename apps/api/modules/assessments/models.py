"""Assessment, CAU, gradebook and term grades (PRD §15.37–§15.43, §22, ADR-005).

Scheme fields beyond §15.38 (documented in docs/adr/018-grading-scheme.md) implement §22.2/§65.6 configuration:
scale_max (display scale, NOSSEF uses 10), precision (decimal places), aggregation (MEAN/TOTAL_POINTS),
absent_policy (ZERO/EXCLUDE), remedial_policy (REPLACE/MAX/CAP_AT_PASSING), passing_inclusive (>= vs >).
"""

import uuid
from decimal import Decimal

from django.conf import settings
from django.db import models
from django.db.models import Q

from common.models import BaseModel


class AssessmentType(BaseModel):
    code = models.CharField(max_length=30, unique=True)
    name = models.CharField(max_length=100)
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ("code",)
        indexes = [models.Index(fields=["active"])]

    def __str__(self):
        return self.code


class GradingScheme(BaseModel):
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        ACTIVE = "ACTIVE", "Active"
        LOCKED = "LOCKED", "Locked"

    class Aggregation(models.TextChoices):
        MEAN = "MEAN", "Mean of normalized scores"
        TOTAL_POINTS = "TOTAL_POINTS", "Total points / total max"

    class AbsentPolicy(models.TextChoices):
        ZERO = "ZERO", "Counts as zero"
        EXCLUDE = "EXCLUDE", "Excluded"

    class RemedialPolicy(models.TextChoices):
        REPLACE = "REPLACE", "Remedial replaces original"
        MAX = "MAX", "Higher of original and remedial"
        CAP_AT_PASSING = "CAP_AT_PASSING", "Higher of both, capped at passing score"

    academic_year = models.ForeignKey("academics.AcademicYear", on_delete=models.PROTECT, related_name="grading_schemes")
    trimester = models.ForeignKey("academics.Trimester", on_delete=models.PROTECT, related_name="grading_schemes")
    subject_offering = models.ForeignKey("academics.SubjectOffering", on_delete=models.PROTECT, related_name="grading_schemes")
    name = models.CharField(max_length=100)
    status = models.CharField(max_length=8, choices=Status.choices, default=Status.DRAFT)
    passing_score = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    passing_inclusive = models.BooleanField(default=True)
    scale_max = models.DecimalField(max_digits=6, decimal_places=2, default=Decimal("100"))
    precision = models.PositiveSmallIntegerField(default=2)
    aggregation = models.CharField(max_length=14, choices=Aggregation.choices, default=Aggregation.MEAN)
    absent_policy = models.CharField(max_length=8, choices=AbsentPolicy.choices, default=AbsentPolicy.ZERO)
    remedial_policy = models.CharField(max_length=16, choices=RemedialPolicy.choices, default=RemedialPolicy.MAX)

    class Meta:
        ordering = ("trimester__number",)
        constraints = [
            models.UniqueConstraint(
                fields=["trimester", "subject_offering"],
                condition=Q(status__in=["ACTIVE", "LOCKED"]),
                name="assessments_single_active_scheme",
            ),
            models.CheckConstraint(condition=Q(scale_max__gt=0), name="assessments_scheme_scale_positive"),
            models.CheckConstraint(condition=Q(precision__lte=4), name="assessments_scheme_precision"),
        ]
        indexes = [models.Index(fields=["trimester", "subject_offering", "status"])]

    def __str__(self):
        return self.name

    def passes(self, score):
        if score is None or self.passing_score is None:
            return None
        return score >= self.passing_score if self.passing_inclusive else score > self.passing_score


class GradingComponent(BaseModel):
    grading_scheme = models.ForeignKey(GradingScheme, on_delete=models.CASCADE, related_name="components")
    assessment_type = models.ForeignKey(AssessmentType, on_delete=models.PROTECT, related_name="components")
    name = models.CharField(max_length=100)
    weight_percent = models.DecimalField(max_digits=5, decimal_places=2)
    sequence = models.PositiveSmallIntegerField(default=1)
    is_cau_component = models.BooleanField(default=False)

    class Meta:
        ordering = ("sequence",)
        constraints = [
            models.CheckConstraint(condition=Q(weight_percent__gt=0, weight_percent__lte=100), name="assessments_component_weight_range")
        ]
        indexes = [models.Index(fields=["grading_scheme", "sequence"])]

    def __str__(self):
        return f"{self.name} {self.weight_percent}%"


class Assessment(BaseModel):
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        OPEN = "OPEN", "Open"
        CLOSED = "CLOSED", "Closed"
        LOCKED = "LOCKED", "Locked"

    teaching_assignment = models.ForeignKey("academics.TeachingAssignment", on_delete=models.PROTECT, related_name="assessments")
    trimester = models.ForeignKey("academics.Trimester", on_delete=models.PROTECT, related_name="assessments")
    assessment_type = models.ForeignKey(AssessmentType, on_delete=models.PROTECT, related_name="assessments")
    grading_component = models.ForeignKey(GradingComponent, on_delete=models.PROTECT, related_name="assessments")
    title = models.CharField(max_length=200)
    assessment_date = models.DateField()
    max_score = models.DecimalField(max_digits=7, decimal_places=2)
    cau_number = models.PositiveSmallIntegerField(null=True, blank=True)
    is_remedial = models.BooleanField(default=False)
    status = models.CharField(max_length=8, choices=Status.choices, default=Status.DRAFT)
    version = models.PositiveIntegerField(default=1)

    class Meta:
        ordering = ("grading_component__sequence", "assessment_date", "title")
        constraints = [
            models.CheckConstraint(condition=Q(max_score__gt=0), name="assessments_max_score_positive"),
            models.CheckConstraint(
                condition=Q(cau_number__isnull=True) | Q(cau_number__gte=1, cau_number__lte=3), name="assessments_cau_1_3"
            ),
        ]
        indexes = [
            models.Index(fields=["teaching_assignment", "trimester"]),
            models.Index(fields=["assessment_type"]),
            models.Index(fields=["assessment_date"]),
        ]

    def __str__(self):
        return self.title


class StudentScore(BaseModel):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        GRADED = "GRADED", "Graded"
        ABSENT = "ABSENT", "Absent"
        EXCUSED = "EXCUSED", "Excused"

    assessment = models.ForeignKey(Assessment, on_delete=models.CASCADE, related_name="scores")
    student = models.ForeignKey("students.Student", on_delete=models.PROTECT, related_name="scores")
    score = models.DecimalField(max_digits=7, decimal_places=2, null=True, blank=True)
    status = models.CharField(max_length=8, choices=Status.choices, default=Status.PENDING)
    is_remedial = models.BooleanField(default=False)
    recorded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    version = models.PositiveIntegerField(default=1)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["assessment", "student"], name="assessments_score_unique"),
            models.CheckConstraint(condition=Q(score__isnull=True) | Q(score__gte=0), name="assessments_score_nonnegative"),
            models.CheckConstraint(
                condition=(Q(status="GRADED") & Q(score__isnull=False)) | (~Q(status="GRADED") & Q(score__isnull=True)),
                name="assessments_score_matches_status",
            ),
        ]
        indexes = [models.Index(fields=["assessment"]), models.Index(fields=["student"]), models.Index(fields=["status"])]

    def __str__(self):
        return f"{self.assessment_id} {self.student_id} {self.score}"


class ScoreRevision(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student_score = models.ForeignKey(StudentScore, on_delete=models.PROTECT, related_name="revisions")
    old_score = models.DecimalField(max_digits=7, decimal_places=2, null=True, blank=True)
    new_score = models.DecimalField(max_digits=7, decimal_places=2, null=True, blank=True)
    old_status = models.CharField(max_length=8, blank=True, default="")
    new_status = models.CharField(max_length=8, blank=True, default="")
    reason = models.TextField()
    changed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    changed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-changed_at",)
        constraints = [models.CheckConstraint(condition=~Q(reason=""), name="assessments_revision_reason_required")]
        indexes = [models.Index(fields=["student_score", "changed_at"])]

    def __str__(self):
        return f"{self.student_score_id} {self.old_score}->{self.new_score}"

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise PermissionError("ScoreRevision is append-only.")
        super().save(*args, **kwargs)


class TermGrade(BaseModel):
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        FINALIZED = "FINALIZED", "Finalized"
        REOPENED = "REOPENED", "Reopened"

    student = models.ForeignKey("students.Student", on_delete=models.PROTECT, related_name="term_grades")
    trimester = models.ForeignKey("academics.Trimester", on_delete=models.PROTECT, related_name="term_grades")
    teaching_assignment = models.ForeignKey("academics.TeachingAssignment", on_delete=models.PROTECT, related_name="term_grades")
    calculated_score = models.DecimalField(max_digits=7, decimal_places=4, null=True, blank=True)
    final_score = models.DecimalField(max_digits=7, decimal_places=4, null=True, blank=True)
    grade_label = models.CharField(max_length=20, blank=True, default="")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    breakdown = models.JSONField(default=dict, blank=True)  # component snapshot for audit/report (PRD §12: snapshots in JSON)
    override_reason = models.TextField(blank=True, default="")
    finalized_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    finalized_at = models.DateTimeField(null=True, blank=True)
    version = models.PositiveIntegerField(default=1)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["student", "trimester", "teaching_assignment"], name="assessments_term_grade_unique"),
            models.CheckConstraint(condition=~Q(status="FINALIZED") | Q(final_score__isnull=False), name="assessments_finalized_has_score"),
        ]
        indexes = [models.Index(fields=["student", "trimester"]), models.Index(fields=["status"])]

    def __str__(self):
        return f"{self.student_id} T{self.trimester_id} {self.final_score}"

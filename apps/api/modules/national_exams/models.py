"""National examination records for grade XII (PRD §15.47, §24, INV-12: separate from CAU, never calculated)."""

from django.db import models

from common.models import BaseModel


class NationalExamRecord(BaseModel):
    class Status(models.TextChoices):
        REGISTERED = "REGISTERED", "Registered"
        ATTENDED = "ATTENDED", "Attended"
        ABSENT = "ABSENT", "Absent"
        PASSED = "PASSED", "Passed"
        FAILED = "FAILED", "Failed"
        PENDING = "PENDING", "Pending"

    student = models.ForeignKey("students.Student", on_delete=models.PROTECT, related_name="national_exams")
    academic_year = models.ForeignKey("academics.AcademicYear", on_delete=models.PROTECT, related_name="national_exams")
    exam_name = models.CharField(max_length=150)
    candidate_no = models.CharField(max_length=100, blank=True, default="")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.REGISTERED)
    overall_score = models.DecimalField(max_digits=7, decimal_places=2, null=True, blank=True)
    result_date = models.DateField(null=True, blank=True)
    certificate_no = models.CharField(max_length=100, blank=True, default="")
    document_file = models.ForeignKey("documents.StoredFile", null=True, blank=True, on_delete=models.PROTECT, related_name="+")

    class Meta:
        ordering = ("-academic_year__start_date", "student__full_name")
        constraints = [models.UniqueConstraint(fields=["student", "academic_year", "exam_name"], name="national_exams_unique_record")]
        indexes = [models.Index(fields=["academic_year", "status"])]

    def __str__(self):
        return f"{self.student_id} {self.exam_name} {self.status}"

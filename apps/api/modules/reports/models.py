"""Asynchronous report/export jobs (PRD §15.78, §32.3). `format` and `row_count` extend §15.78 for the export UI."""

from django.conf import settings
from django.db import models
from django.db.models import Q

from common.models import BaseModel


class ReportJob(BaseModel):
    class Status(models.TextChoices):
        QUEUED = "QUEUED", "Queued"
        RUNNING = "RUNNING", "Running"
        SUCCEEDED = "SUCCEEDED", "Succeeded"
        FAILED = "FAILED", "Failed"
        EXPIRED = "EXPIRED", "Expired"

    class Format(models.TextChoices):
        CSV = "CSV", "CSV"
        XLSX = "XLSX", "Excel"
        PDF = "PDF", "PDF"

    requested_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    report_type = models.CharField(max_length=80)
    parameters = models.JSONField(default=dict)
    format = models.CharField(max_length=4, choices=Format.choices, default=Format.XLSX)
    status = models.CharField(max_length=9, choices=Status.choices, default=Status.QUEUED)
    progress_percent = models.PositiveSmallIntegerField(default=0)
    row_count = models.PositiveIntegerField(default=0)
    result_file = models.ForeignKey("documents.StoredFile", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    error_code = models.CharField(max_length=100, blank=True, default="")
    finished_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [models.Index(fields=["requested_by", "-created_at"]), models.Index(fields=["status"])]
        constraints = [
            models.CheckConstraint(condition=Q(progress_percent__gte=0, progress_percent__lte=100), name="reports_progress_range")
        ]

    def __str__(self):
        return f"{self.report_type} {self.status}"

"""Import jobs (PRD §15.79–§15.80, §32.2). Never inserts on upload: UPLOADED → VALIDATING → READY/INVALID → QUEUED →
PROCESSING → COMPLETED/COMPLETED_WITH_ERRORS/FAILED (PRD §66).

`params` (validated per import type), `preview` (normalized rows), `checksum` (same-file retry detection), `result` and
`error_code` extend §15.79 as required by §32.2.
"""

from django.conf import settings
from django.db import models
from django.db.models import Q

from common.models import BaseModel


class ImportJob(BaseModel):
    class Status(models.TextChoices):
        UPLOADED = "UPLOADED", "Uploaded"
        VALIDATING = "VALIDATING", "Validating"
        READY = "READY", "Ready"
        INVALID = "INVALID", "Invalid"
        QUEUED = "QUEUED", "Queued"
        PROCESSING = "PROCESSING", "Processing"
        COMPLETED = "COMPLETED", "Completed"
        COMPLETED_WITH_ERRORS = "COMPLETED_WITH_ERRORS", "Completed with errors"
        FAILED = "FAILED", "Failed"

    import_type = models.CharField(max_length=80)
    source_file = models.ForeignKey("documents.StoredFile", on_delete=models.PROTECT, related_name="+")
    requested_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    status = models.CharField(max_length=24, choices=Status.choices, default=Status.UPLOADED)
    params = models.JSONField(default=dict)
    total_rows = models.PositiveIntegerField(default=0)
    valid_rows = models.PositiveIntegerField(default=0)
    invalid_rows = models.PositiveIntegerField(default=0)
    preview = models.JSONField(default=list)
    result = models.JSONField(default=dict)
    result_file = models.ForeignKey("documents.StoredFile", null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    checksum = models.CharField(max_length=64)
    idempotency_key = models.CharField(max_length=100, unique=True)
    error_code = models.CharField(max_length=100, blank=True, default="")
    finished_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=["status"]),
            models.Index(fields=["created_at"]),
            models.Index(fields=["requested_by", "import_type"]),
        ]
        constraints = [models.CheckConstraint(condition=Q(valid_rows__lte=models.F("total_rows")), name="integrations_valid_le_total")]

    def __str__(self):
        return f"{self.import_type} {self.status}"


class ImportRowError(BaseModel):
    import_job = models.ForeignKey(ImportJob, on_delete=models.CASCADE, related_name="row_errors")
    row_number = models.PositiveIntegerField()
    field_name = models.CharField(max_length=100, blank=True, default="")
    error_code = models.CharField(max_length=100)
    message = models.TextField()
    raw_value = models.TextField(blank=True, default="")

    class Meta:
        ordering = ("row_number",)
        constraints = [models.CheckConstraint(condition=Q(row_number__gt=0), name="integrations_row_number_positive")]
        indexes = [models.Index(fields=["import_job", "row_number"])]

    def __str__(self):
        return f"{self.import_job_id} r{self.row_number} {self.error_code}"

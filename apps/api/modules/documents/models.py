"""Private file metadata and generated documents (PRD §15.76–§15.77, §31, ADR-010)."""

import uuid

from django.conf import settings
from django.db import models
from django.db.models import Q


class Classification(models.TextChoices):
    PUBLIC = "PUBLIC", "Public"
    INTERNAL = "INTERNAL", "Internal"
    CONFIDENTIAL = "CONFIDENTIAL", "Confidential"
    RESTRICTED = "RESTRICTED", "Restricted"


class StoredFile(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    object_key = models.CharField(max_length=500, unique=True)
    original_name = models.CharField(max_length=255)
    mime_type = models.CharField(max_length=150)
    size_bytes = models.BigIntegerField()
    sha256 = models.CharField(max_length=64)
    classification = models.CharField(max_length=12, choices=Classification.choices, default=Classification.CONFIDENTIAL)
    purpose = models.CharField(max_length=40, blank=True, default="")
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    # Unattached uploads are temporary and cleaned up (PRD §37.3 stale upload cleanup).
    attached = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)
        constraints = [models.CheckConstraint(condition=Q(size_bytes__gte=0), name="documents_file_size_nonnegative")]
        indexes = [
            models.Index(fields=["classification"]),
            models.Index(fields=["sha256"]),
            models.Index(fields=["attached", "created_at"]),
        ]

    def __str__(self):
        return self.original_name


class GeneratedDocument(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document_type = models.CharField(max_length=80)
    resource_type = models.CharField(max_length=80)
    resource_id = models.CharField(max_length=64)
    revision = models.PositiveIntegerField(default=1)
    file = models.ForeignKey(StoredFile, on_delete=models.PROTECT, related_name="generated_documents")
    generated_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    generated_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-generated_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["document_type", "resource_type", "resource_id", "revision"], name="documents_generated_unique_revision"
            )
        ]
        indexes = [models.Index(fields=["resource_type", "resource_id"])]

    def __str__(self):
        return f"{self.document_type} {self.resource_id} r{self.revision}"

"""Reusable model building blocks (F0-11). Used by composition where appropriate, not forced."""

import uuid

from django.conf import settings
from django.db import models


class UUIDPrimaryKey(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    class Meta:
        abstract = True


class Timestamped(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class Authored(models.Model):
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+")

    class Meta:
        abstract = True


class BaseModel(UUIDPrimaryKey, Timestamped):
    """UUID PK + timestamps — the default for public-facing domain records (PRD §10)."""

    class Meta:
        abstract = True


class Versioned(models.Model):
    """Integer version for offline-sensitive / concurrently edited records (PRD §11.5, §46.6)."""

    version = models.PositiveIntegerField(default=1)

    class Meta:
        abstract = True


class Sequence(models.Model):
    """Gap-tolerant, concurrency-safe counters for human document numbers (PRD §10: separate from PK)."""

    key = models.CharField(max_length=100, primary_key=True)
    value = models.PositiveBigIntegerField(default=0)

    class Meta:
        db_table = "common_sequence"

    def __str__(self):
        return f"{self.key}={self.value}"


def next_number(key):
    """Atomically increment and return the next value for `key` (row lock; call inside a transaction)."""
    from django.db import transaction

    with transaction.atomic():
        seq, _ = Sequence.objects.select_for_update().get_or_create(key=key)
        seq.value += 1
        seq.save(update_fields=["value"])
        return seq.value

"""SchoolProfile singleton (PRD §15.1, F1-07). INV-01: one production instance = one SMA."""

import uuid
import zoneinfo

from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q

from modules.accounts.models import Locale


def validate_timezone(value):
    try:
        zoneinfo.ZoneInfo(value)
    except (zoneinfo.ZoneInfoNotFoundError, ValueError) as exc:
        raise ValidationError("Timezone harus zona IANA yang valid.") from exc


class SchoolProfile(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    singleton = models.BooleanField(default=True, editable=False)
    name = models.CharField(max_length=200)
    code = models.CharField(max_length=50, blank=True, default="")
    address = models.TextField(blank=True, default="")
    municipality = models.CharField(max_length=100, blank=True, default="")
    phone = models.CharField(max_length=50, blank=True, default="")
    email = models.EmailField(blank=True, default="")
    timezone = models.CharField(max_length=64, default="Asia/Dili", validators=[validate_timezone])
    currency = models.CharField(max_length=3, default="USD")
    default_locale = models.CharField(max_length=10, choices=Locale.choices, default=Locale.TETUN)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["singleton"], name="school_profile_singleton"),
            models.CheckConstraint(condition=Q(singleton=True), name="school_profile_singleton_true"),
        ]
        indexes = [models.Index(fields=["name"])]

    def __str__(self):
        return self.name

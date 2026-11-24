"""Announcements, notifications and Web Push (PRD §15.71–§15.75, §30). `priority` and `attachment` extend §15.71 per
§30.1; notification preferences (§F12-12) are stored per user and event type."""

from django.conf import settings
from django.db import models
from django.db.models import F, Q

from common.models import BaseModel


class Announcement(BaseModel):
    class Audience(models.TextChoices):
        ALL = "ALL", "All"
        ROLE = "ROLE", "Role"
        GRADE = "GRADE", "Grade"
        MAJOR = "MAJOR", "Major"
        CLASS = "CLASS", "Class"
        STUDENT = "STUDENT", "Student"
        GUARDIAN = "GUARDIAN", "Guardian"
        STAFF = "STAFF", "Staff"

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        SCHEDULED = "SCHEDULED", "Scheduled"
        PUBLISHED = "PUBLISHED", "Published"
        ARCHIVED = "ARCHIVED", "Archived"

    class Priority(models.TextChoices):
        NORMAL = "NORMAL", "Normal"
        IMPORTANT = "IMPORTANT", "Important"
        URGENT = "URGENT", "Urgent"

    title = models.CharField(max_length=200)
    body = models.TextField()
    audience_type = models.CharField(max_length=8, choices=Audience.choices, default=Audience.ALL)
    priority = models.CharField(max_length=10, choices=Priority.choices, default=Priority.NORMAL)
    publish_at = models.DateTimeField()
    expire_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    attachment = models.ForeignKey("documents.StoredFile", null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    published_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-publish_at",)
        indexes = [models.Index(fields=["status", "publish_at"])]
        constraints = [
            models.CheckConstraint(
                condition=Q(expire_at__isnull=True) | Q(expire_at__gt=F("publish_at")), name="communications_expire_after_publish"
            )
        ]

    def __str__(self):
        return self.title


class AnnouncementAudience(BaseModel):
    announcement = models.ForeignKey(Announcement, on_delete=models.CASCADE, related_name="audiences")
    role_code = models.CharField(max_length=50, blank=True, default="")
    grade_level = models.ForeignKey("academics.GradeLevel", null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    major = models.ForeignKey("academics.Major", null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    classroom = models.ForeignKey("academics.ClassRoom", null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    student = models.ForeignKey("students.Student", null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    include_guardians = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=~Q(role_code="")
                | Q(grade_level__isnull=False)
                | Q(major__isnull=False)
                | Q(classroom__isnull=False)
                | Q(student__isnull=False),
                name="communications_audience_has_selector",
            )
        ]


class Notification(BaseModel):
    recipient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications")
    type = models.CharField(max_length=80)
    title = models.CharField(max_length=200)
    body = models.TextField()
    target_url = models.CharField(max_length=300, blank=True, default="")
    dedup_key = models.CharField(max_length=180, null=True, blank=True)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [models.Index(fields=["recipient", "read_at"]), models.Index(fields=["recipient", "-created_at"])]
        constraints = [
            models.UniqueConstraint(
                fields=["recipient", "dedup_key"], condition=Q(dedup_key__isnull=False), name="communications_notification_dedup"
            )
        ]


class NotificationDelivery(BaseModel):
    class Channel(models.TextChoices):
        IN_APP = "IN_APP", "In-app"
        PUSH = "PUSH", "Web Push"
        EMAIL = "EMAIL", "Email"

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        SENT = "SENT", "Sent"
        FAILED = "FAILED", "Failed"
        SKIPPED = "SKIPPED", "Skipped"

    notification = models.ForeignKey(Notification, on_delete=models.CASCADE, related_name="deliveries")
    channel = models.CharField(max_length=6, choices=Channel.choices)
    status = models.CharField(max_length=7, choices=Status.choices, default=Status.PENDING)
    attempt_count = models.PositiveSmallIntegerField(default=0)
    last_error_code = models.CharField(max_length=100, blank=True, default="")
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["notification", "channel"], name="communications_delivery_unique_channel")]
        indexes = [models.Index(fields=["status", "channel"])]


class PushSubscription(BaseModel):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="push_subscriptions")
    endpoint_hash = models.CharField(max_length=64, unique=True)
    endpoint_encrypted = models.TextField()
    p256dh_encrypted = models.TextField()
    auth_encrypted = models.TextField()
    user_agent = models.CharField(max_length=300, blank=True, default="")
    active = models.BooleanField(default=True)
    last_success_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=["user", "active"])]


class NotificationPreference(BaseModel):
    """Per-user opt-out for optional channels (in-app inbox is always kept as delivery history)."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notification_preferences")
    event_type = models.CharField(max_length=80)
    push_enabled = models.BooleanField(default=True)
    email_enabled = models.BooleanField(default=False)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["user", "event_type"], name="communications_pref_unique")]

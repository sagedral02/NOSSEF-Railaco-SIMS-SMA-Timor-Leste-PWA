"""Inventory/assets (PRD §15.68–§15.70, §29). One active assignment per asset (partial unique index); history is never
deleted; RETIRED assets need a privileged restore. Extensions from §29.3: condition_after on return, retire reason,
location transfer log."""

from django.conf import settings
from django.db import models
from django.db.models import F, Q

from common.models import BaseModel


class Asset(BaseModel):
    class Condition(models.TextChoices):
        GOOD = "GOOD", "Good"
        FAIR = "FAIR", "Fair"
        DAMAGED = "DAMAGED", "Damaged"
        REPAIR = "REPAIR", "Repair"
        LOST = "LOST", "Lost"

    class Status(models.TextChoices):
        AVAILABLE = "AVAILABLE", "Available"
        ASSIGNED = "ASSIGNED", "Assigned"
        MAINTENANCE = "MAINTENANCE", "Maintenance"
        RETIRED = "RETIRED", "Retired"
        LOST = "LOST", "Lost"

    asset_no = models.CharField(max_length=80, unique=True)
    name = models.CharField(max_length=200)
    category = models.CharField(max_length=100)
    serial_no = models.CharField(max_length=100, blank=True, default="")
    purchase_date = models.DateField(null=True, blank=True)
    purchase_cost = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    location_room = models.ForeignKey("academics.Room", null=True, blank=True, on_delete=models.PROTECT, related_name="assets")
    condition = models.CharField(max_length=8, choices=Condition.choices, default=Condition.GOOD)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.AVAILABLE)
    retire_reason = models.TextField(blank=True, default="")
    attachment = models.ForeignKey("documents.StoredFile", null=True, blank=True, on_delete=models.PROTECT, related_name="+")

    class Meta:
        ordering = ("asset_no",)
        indexes = [models.Index(fields=["status"]), models.Index(fields=["category"])]
        constraints = [models.CheckConstraint(condition=Q(purchase_cost__isnull=True) | Q(purchase_cost__gte=0), name="assets_cost_nonneg")]

    def __str__(self):
        return self.asset_no


class AssetAssignment(BaseModel):
    class Target(models.TextChoices):
        TEACHER = "TEACHER", "Teacher"
        STAFF = "STAFF", "Staff"
        ROOM = "ROOM", "Room"

    asset = models.ForeignKey(Asset, on_delete=models.PROTECT, related_name="assignments")
    assigned_to_type = models.CharField(max_length=8, choices=Target.choices)
    teacher = models.ForeignKey("staff.Teacher", null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    staff = models.ForeignKey("staff.StaffProfile", null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    room = models.ForeignKey("academics.Room", null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    assigned_at = models.DateTimeField()
    returned_at = models.DateTimeField(null=True, blank=True)
    condition_after = models.CharField(max_length=8, blank=True, default="")
    note = models.TextField(blank=True, default="")
    assigned_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")

    class Meta:
        ordering = ("-assigned_at",)
        constraints = [
            models.UniqueConstraint(fields=["asset"], condition=Q(returned_at__isnull=True), name="assets_one_active_assignment"),
            models.CheckConstraint(
                condition=(Q(assigned_to_type="TEACHER") & Q(teacher__isnull=False) & Q(staff__isnull=True) & Q(room__isnull=True))
                | (Q(assigned_to_type="STAFF") & Q(staff__isnull=False) & Q(teacher__isnull=True) & Q(room__isnull=True))
                | (Q(assigned_to_type="ROOM") & Q(room__isnull=False) & Q(teacher__isnull=True) & Q(staff__isnull=True)),
                name="assets_exactly_one_target",
            ),
            models.CheckConstraint(
                condition=Q(returned_at__isnull=True) | Q(returned_at__gte=F("assigned_at")), name="assets_assignment_range"
            ),
        ]


class AssetMaintenance(BaseModel):
    class Status(models.TextChoices):
        OPEN = "OPEN", "Open"
        COMPLETED = "COMPLETED", "Completed"
        CANCELLED = "CANCELLED", "Cancelled"

    asset = models.ForeignKey(Asset, on_delete=models.PROTECT, related_name="maintenance")
    started_at = models.DateField()
    completed_at = models.DateField(null=True, blank=True)
    description = models.TextField()
    cost = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    vendor = models.CharField(max_length=150, blank=True, default="")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.OPEN)

    class Meta:
        ordering = ("-started_at",)
        constraints = [
            models.CheckConstraint(
                condition=Q(completed_at__isnull=True) | Q(completed_at__gte=F("started_at")), name="assets_maintenance_range"
            )
        ]


class AssetMovement(BaseModel):
    """Location transfer log (§29.1)."""

    asset = models.ForeignKey(Asset, on_delete=models.PROTECT, related_name="movements")
    from_room = models.ForeignKey("academics.Room", null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    to_room = models.ForeignKey("academics.Room", null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    moved_at = models.DateTimeField()
    moved_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    note = models.TextField(blank=True, default="")

    class Meta:
        ordering = ("-moved_at",)

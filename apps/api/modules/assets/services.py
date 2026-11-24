"""Asset workflows (PRD §29.3): locked assignment, maintenance without losing assignment history, audited transfers,
retire/restore."""

from django.db import IntegrityError, transaction
from django.utils import timezone

from common.api.exceptions import ConflictError, DomainError, ErrorCode
from modules.audit import services as audit
from modules.audit.events import AuditEvent

from .models import Asset, AssetAssignment, AssetMaintenance, AssetMovement

S = Asset.Status


def _lock(asset):
    return Asset.objects.select_for_update().get(pk=asset.pk)


@transaction.atomic
def assign(*, actor, asset, target_type, teacher=None, staff=None, room=None, note=""):
    a = _lock(asset)
    if a.status != S.AVAILABLE:
        raise ConflictError(ErrorCode.ASSET_NOT_AVAILABLE, f"Aset {a.asset_no} berstatus {a.status}.", details={"status": a.status})
    try:
        with transaction.atomic():
            asg = AssetAssignment(
                asset=a,
                assigned_to_type=target_type,
                teacher=teacher,
                staff=staff,
                room=room,
                assigned_at=timezone.now(),
                note=note,
                assigned_by=actor,
            )
            asg.full_clean()
            asg.save()
    except IntegrityError:
        raise ConflictError(ErrorCode.ASSET_NOT_AVAILABLE, "Aset sudah memiliki penugasan aktif.")
    a.status = S.ASSIGNED
    if room is not None and a.location_room_id != room.pk:
        AssetMovement.objects.create(
            asset=a, from_room_id=a.location_room_id, to_room=room, moved_at=timezone.now(), moved_by=actor, note="Penugasan ke ruang"
        )
        a.location_room = room
    a.save(update_fields=["status", "location_room", "updated_at"])
    audit.record(
        AuditEvent.ASSET_ASSIGNED, actor=actor, resource=a, after={"to": target_type, "target": str((teacher or staff or room).pk)}
    )
    return asg


@transaction.atomic
def return_assignment(*, actor, asset, condition_after="GOOD", note=""):
    a = _lock(asset)
    asg = a.assignments.filter(returned_at__isnull=True).first()
    if asg is None:
        raise ConflictError(ErrorCode.INVALID_STATE_TRANSITION, "Aset tidak sedang ditugaskan.")
    asg.returned_at, asg.condition_after = timezone.now(), condition_after
    if note:
        asg.note = f"{asg.note}\n{note}".strip()
    asg.save(update_fields=["returned_at", "condition_after", "note", "updated_at"])
    a.condition = condition_after if condition_after in Asset.Condition.values else a.condition
    a.status = S.MAINTENANCE if condition_after in {"DAMAGED", "REPAIR"} else S.AVAILABLE
    a.save(update_fields=["condition", "status", "updated_at"])
    audit.record(AuditEvent.ASSET_ASSIGNED, actor=actor, resource=a, after={"action": "return", "condition": condition_after})
    return asg


@transaction.atomic
def start_maintenance(*, actor, asset, description, vendor="", started_at=None):
    a = _lock(asset)
    if a.status in {S.RETIRED, S.LOST}:
        raise ConflictError(ErrorCode.ASSET_NOT_AVAILABLE, f"Aset berstatus {a.status}.")
    m = AssetMaintenance.objects.create(asset=a, description=description, vendor=vendor, started_at=started_at or timezone.localdate())
    if a.status != S.ASSIGNED:  # assigned assets keep their assignment history; status follows the open assignment
        a.status = S.MAINTENANCE
        a.save(update_fields=["status", "updated_at"])
    audit.record(AuditEvent.ASSET_CHANGED, actor=actor, resource=a, after={"action": "maintenance_start"})
    return m


@transaction.atomic
def complete_maintenance(*, actor, maintenance, cost=None, status="COMPLETED", condition="GOOD"):
    m = AssetMaintenance.objects.select_for_update().get(pk=maintenance.pk)
    if m.status != "OPEN":
        raise ConflictError(ErrorCode.INVALID_STATE_TRANSITION, "Perawatan sudah ditutup.")
    m.status, m.completed_at, m.cost = status, timezone.localdate(), cost
    m.full_clean()
    m.save()
    a = _lock(m.asset)
    if a.status == S.MAINTENANCE and not a.maintenance.filter(status="OPEN").exists():
        a.status, a.condition = S.AVAILABLE, condition
        a.save(update_fields=["status", "condition", "updated_at"])
    audit.record(
        AuditEvent.ASSET_CHANGED,
        actor=actor,
        resource=a,
        after={"action": "maintenance_" + status.lower(), "cost": str(cost) if cost is not None else None},
    )
    return m


@transaction.atomic
def transfer(*, actor, asset, to_room, note=""):
    a = _lock(asset)
    if a.status in {S.RETIRED, S.LOST}:
        raise ConflictError(ErrorCode.ASSET_NOT_AVAILABLE, f"Aset berstatus {a.status}.")
    mv = AssetMovement.objects.create(
        asset=a, from_room_id=a.location_room_id, to_room=to_room, moved_at=timezone.now(), moved_by=actor, note=note
    )
    a.location_room = to_room
    a.save(update_fields=["location_room", "updated_at"])
    audit.record(AuditEvent.ASSET_CHANGED, actor=actor, resource=a, after={"action": "transfer", "to": to_room.code if to_room else None})
    return mv


@transaction.atomic
def retire(*, actor, asset, reason, lost=False):
    a = _lock(asset)
    if a.assignments.filter(returned_at__isnull=True).exists():
        raise ConflictError(ErrorCode.ASSET_NOT_AVAILABLE, "Kembalikan penugasan aktif sebelum menghapusbukukan aset.")
    if not reason.strip():
        raise DomainError(ErrorCode.VALIDATION_ERROR, "Data tidak valid.", fields={"reason": ["Wajib."]})
    before = a.status
    a.status, a.retire_reason = (S.LOST if lost else S.RETIRED), reason
    if lost:
        a.condition = "LOST"
    a.save(update_fields=["status", "retire_reason", "condition", "updated_at"])
    audit.record(
        AuditEvent.ASSET_CHANGED,
        actor=actor,
        resource=a,
        before={"status": before},
        after={"status": a.status},
        metadata={"reason": reason[:300]},
    )
    return a


@transaction.atomic
def restore(*, actor, asset, reason):
    """Privileged restore workflow for RETIRED/LOST assets (asset.manage + reason)."""
    a = _lock(asset)
    if a.status not in {S.RETIRED, S.LOST}:
        raise ConflictError(ErrorCode.INVALID_STATE_TRANSITION, "Hanya aset RETIRED/LOST yang dapat dipulihkan.")
    if not reason.strip():
        raise DomainError(ErrorCode.VALIDATION_ERROR, "Data tidak valid.", fields={"reason": ["Wajib."]})
    before = a.status
    a.status = S.AVAILABLE
    a.save(update_fields=["status", "updated_at"])
    audit.record(
        AuditEvent.ASSET_CHANGED,
        actor=actor,
        resource=a,
        before={"status": before},
        after={"status": "AVAILABLE"},
        metadata={"reason": reason[:300], "action": "restore"},
    )
    return a

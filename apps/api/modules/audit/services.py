"""Audit append service (F0-12, F1-09). Call inside the same transaction as the business change."""

from common.context import client_ip_var, current_request_id, user_agent_var

from .models import AuditLog

# Keys never written to snapshots (PRD §14.1: minimize PII, never secrets).
_REDACT = ("password", "token", "session", "csrf", "secret", "narrative")


def _scrub(value):
    if isinstance(value, dict):
        return {k: ("[REDACTED]" if any(part in str(k).lower() for part in _REDACT) else _scrub(v)) for k, v in value.items()}
    if isinstance(value, list):
        return [_scrub(v) for v in value]
    return value


def record(event_type, *, actor=None, resource=None, resource_type="", resource_id="", before=None, after=None, metadata=None):
    if resource is not None:
        resource_type = resource_type or resource._meta.label_lower
        resource_id = resource_id or str(resource.pk)
    actor_obj = actor if getattr(actor, "is_authenticated", False) else None
    return AuditLog.objects.create(
        actor=actor_obj,
        event_type=event_type,
        resource_type=resource_type or "",
        resource_id=str(resource_id or ""),
        request_id=current_request_id(),
        ip_address=client_ip_var.get(),
        user_agent=user_agent_var.get() or "",
        before=_scrub(before) if before is not None else None,
        after=_scrub(after) if after is not None else None,
        metadata=_scrub(metadata or {}),
    )


def diff(before, after):
    """Return only the changed keys as (before_subset, after_subset)."""
    keys = {k for k in set(before) | set(after) if before.get(k) != after.get(k)}
    return {k: before.get(k) for k in keys}, {k: after.get(k) for k in keys}

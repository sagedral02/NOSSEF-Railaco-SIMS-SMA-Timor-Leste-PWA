import pytest

from modules.audit import services as audit
from modules.audit.models import AuditLog

pytestmark = pytest.mark.django_db


def test_audit_is_append_only():
    row = audit.record("SYSTEM_SETTING_CHANGED", resource_type="x", resource_id="1", metadata={"a": 1})
    with pytest.raises(PermissionError):
        row.save()
    with pytest.raises(PermissionError):
        row.delete()
    with pytest.raises(PermissionError):
        AuditLog.objects.all().delete()
    with pytest.raises(PermissionError):
        AuditLog.objects.update(event_type="X")


def test_audit_scrubs_secrets():
    row = audit.record("USER_UPDATED", after={"password": "x", "full_name": "A"}, metadata={"token": "t"})
    assert row.after == {"password": "[REDACTED]", "full_name": "A"}
    assert row.metadata == {"token": "[REDACTED]"}


def test_profile_change_writes_audit_with_diff(as_role):
    api = as_role("SUPER_ADMIN")
    response = api.patch("/api/v1/school/profile/", {"municipality": "Ermera"}, format="json")
    assert response.status_code == 200
    row = AuditLog.objects.get(event_type="SYSTEM_SETTING_CHANGED")
    assert row.after == {"municipality": "Ermera"}
    assert row.actor_id == api.user.pk
    assert row.request_id is not None


def test_invalid_timezone_rejected(as_role):
    api = as_role("SUPER_ADMIN")
    response = api.patch("/api/v1/school/profile/", {"timezone": "Mars/Base"}, format="json")
    assert response.status_code == 400
    assert "timezone" in response.json()["error"]["fields"]


def test_audit_api_is_read_only_and_cursor_paginated(as_role):
    api = as_role("SUPER_ADMIN")
    for i in range(30):
        audit.record("EXPORT_GENERATED", resource_type="t", resource_id=str(i))
    first = api.get("/api/v1/audit-logs/?event_type=EXPORT_GENERATED")
    body = first.json()
    assert len(body["data"]) == 25 and body["meta"]["next_cursor"]
    second = api.get(f"/api/v1/audit-logs/?event_type=EXPORT_GENERATED&cursor={body['meta']['next_cursor']}")
    assert len(second.json()["data"]) == 5
    assert api.post("/api/v1/audit-logs/", {}, format="json").status_code == 405
    row_id = body["data"][0]["id"]
    assert api.delete(f"/api/v1/audit-logs/{row_id}/").status_code == 405

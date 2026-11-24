"""API contract (PRD §46): envelope, request id, health, pagination limits, OpenAPI generation."""

import uuid

import pytest
from django.core.management import call_command

pytestmark = pytest.mark.django_db


def test_health_live_and_ready(client):
    live = client.get("/api/v1/health/live")
    assert live.status_code == 200 and live.json()["data"]["status"] == "ok"
    ready = client.get("/api/v1/health/ready")
    assert ready.status_code == 200 and ready.json()["data"]["checks"]["database"] == "ok"


def test_incoming_request_id_is_propagated(client):
    rid = str(uuid.uuid4())
    response = client.get("/api/v1/health/live", HTTP_X_REQUEST_ID=rid)
    assert response["X-Request-ID"] == rid
    assert response.json()["meta"]["request_id"] == rid
    bogus = client.get("/api/v1/health/live", HTTP_X_REQUEST_ID="not-a-uuid")
    assert uuid.UUID(bogus["X-Request-ID"])


def test_error_envelope_shape(client):
    body = client.get("/api/v1/auth/me/").json()
    assert set(body["error"]) == {"code", "message", "fields", "request_id", "details"}
    assert body["error"]["request_id"] == body["meta"]["request_id"]


def test_not_found_uses_stable_code(as_role):
    api = as_role("SUPER_ADMIN")
    response = api.get(f"/api/v1/users/{uuid.uuid4()}/")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "RESOURCE_NOT_FOUND"


def test_page_size_capped_at_100(as_role, make_user):
    api = as_role("SUPER_ADMIN")
    for i in range(3):
        make_user(f"x{i}")
    meta = api.get("/api/v1/users/?page_size=1000").json()["meta"]
    assert meta["page_size"] == 100


def test_openapi_schema_generates(tmp_path):
    out = tmp_path / "schema.yaml"
    call_command("spectacular", "--file", str(out), "--validate")
    assert "/api/v1/auth/login/" in out.read_text(encoding="utf-8")

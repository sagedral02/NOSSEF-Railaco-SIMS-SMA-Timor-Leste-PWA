"""F1 exit criteria: login/session/CSRF, disabled account blocked, password reset, audit rows."""

import re

import pytest
from django.core import mail
from django.db import IntegrityError

from common.api.exceptions import DomainError
from conftest import PASSWORD
from modules.accounts import services
from modules.accounts.models import AccountStatus, User
from modules.audit.models import AuditLog

pytestmark = pytest.mark.django_db


def _csrf(client):
    response = client.get("/api/v1/auth/csrf/")
    assert response.status_code == 200
    return response.json()["data"]["csrf_token"]


def _login(client, username, password=PASSWORD):
    token = _csrf(client)
    return client.post("/api/v1/auth/login/", {"username": username, "password": password}, format="json", HTTP_X_CSRFTOKEN=token)


def test_login_success_returns_me_and_audits(csrf_client, make_user):
    make_user("guru", roles=["TEACHER"])
    response = _login(csrf_client, "GURU")  # usernames are case-insensitive
    assert response.status_code == 200
    body = response.json()
    assert body["data"]["username"] == "guru"
    assert "TEACHER" in body["data"]["roles"]
    assert "attendance.record" in body["data"]["permissions"]
    assert body["meta"]["request_id"] == response["X-Request-ID"]
    assert AuditLog.objects.filter(event_type="LOGIN_SUCCESS", actor__username="guru").exists()

    me = csrf_client.get("/api/v1/auth/me/")
    assert me.status_code == 200 and me.json()["data"]["username"] == "guru"


def test_login_wrong_password_is_generic_and_audited(csrf_client, make_user):
    make_user("guru")
    response = _login(csrf_client, "guru", "salah-sekali")
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "AUTH_INVALID_CREDENTIALS"
    unknown = _login(csrf_client, "tidak-ada", "salah-sekali")
    assert unknown.json()["error"] == {**unknown.json()["error"], "code": "AUTH_INVALID_CREDENTIALS"}
    assert response.json()["error"]["message"] == unknown.json()["error"]["message"]
    assert AuditLog.objects.filter(event_type="LOGIN_FAILURE").count() == 2


def test_login_without_csrf_token_is_rejected(csrf_client, make_user):
    make_user("guru")
    response = csrf_client.post("/api/v1/auth/login/", {"username": "guru", "password": PASSWORD}, format="json")
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "AUTH_CSRF_FAILED"


def test_unsafe_authenticated_request_requires_csrf(csrf_client, make_user):
    make_user("admin1", roles=["SUPER_ADMIN"])
    assert _login(csrf_client, "admin1").status_code == 200
    response = csrf_client.patch("/api/v1/school/profile/", {"phone": "+670 1234"}, format="json")
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "AUTH_CSRF_FAILED"
    token = csrf_client.cookies["csrftoken"].value
    ok = csrf_client.patch("/api/v1/school/profile/", {"phone": "+670 1234"}, format="json", HTTP_X_CSRFTOKEN=token)
    assert ok.status_code == 200


def test_unauthenticated_is_401(client):
    response = client.get("/api/v1/auth/me/")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "AUTH_NOT_AUTHENTICATED"


def test_disabled_account_blocked_and_sessions_revoked(csrf_client, make_user):
    admin = make_user("boss", roles=["SUPER_ADMIN"])
    target = make_user("guru", roles=["TEACHER"])
    assert _login(csrf_client, "guru").status_code == 200
    assert csrf_client.get("/api/v1/auth/me/").status_code == 200

    services.change_status(actor=admin, user=target, target=AccountStatus.DISABLED, reason="pindah sekolah")

    assert csrf_client.get("/api/v1/auth/me/").status_code == 401  # existing session revoked
    again = _login(csrf_client, "guru")
    assert again.status_code == 403
    assert again.json()["error"]["code"] == "AUTH_ACCOUNT_INACTIVE"
    target.refresh_from_db()
    assert target.is_active is False
    assert not target.user_roles.filter(revoked_at__isnull=True).exists()
    assert AuditLog.objects.filter(event_type="USER_DISABLED", resource_id=str(target.pk)).exists()


def test_cannot_disable_self(make_user):
    admin = make_user("boss", roles=["SUPER_ADMIN"])
    with pytest.raises(DomainError) as exc:
        services.change_status(actor=admin, user=admin, target=AccountStatus.DISABLED)
    assert exc.value.error_code == "INVALID_STATE_TRANSITION"


def test_logout_ends_session(csrf_client, make_user):
    make_user("guru")
    _login(csrf_client, "guru")
    token = csrf_client.cookies["csrftoken"].value
    assert csrf_client.post("/api/v1/auth/logout/", HTTP_X_CSRFTOKEN=token).status_code == 204
    assert csrf_client.get("/api/v1/auth/me/").status_code == 401
    assert AuditLog.objects.filter(event_type="LOGOUT").exists()


def test_password_reset_is_single_use(csrf_client, make_user):
    make_user("guru", email="guru@example.test")
    token = _csrf(csrf_client)
    for ident in ("guru", "tidak-ada"):  # identical response either way (no enumeration)
        response = csrf_client.post("/api/v1/auth/password-reset/request/", {"identifier": ident}, format="json", HTTP_X_CSRFTOKEN=token)
        assert response.status_code == 202
    assert len(mail.outbox) == 1
    uid, reset_token = re.search(r"uid=([^&]+)&token=(\S+)", mail.outbox[0].body).groups()

    payload = {"uid": uid, "token": reset_token, "new_password": "Kata-Sandi-Baru-77"}
    first = csrf_client.post("/api/v1/auth/password-reset/confirm/", payload, format="json", HTTP_X_CSRFTOKEN=token)
    assert first.status_code == 204
    second = csrf_client.post("/api/v1/auth/password-reset/confirm/", payload, format="json", HTTP_X_CSRFTOKEN=token)
    assert second.status_code == 400
    assert second.json()["error"]["code"] == "AUTH_RESET_TOKEN_INVALID"
    assert _login(csrf_client, "guru", "Kata-Sandi-Baru-77").status_code == 200
    assert AuditLog.objects.filter(event_type="PASSWORD_RESET").count() == 1


def test_weak_password_rejected_with_field_error(csrf_client, make_user):
    make_user("guru")
    _login(csrf_client, "guru")
    token = csrf_client.cookies["csrftoken"].value
    response = csrf_client.post(
        "/api/v1/auth/password/change/",
        {"current_password": PASSWORD, "new_password": "123"},
        format="json",
        HTTP_X_CSRFTOKEN=token,
    )
    assert response.status_code == 400
    assert "new_password" in response.json()["error"]["fields"]


def test_username_normalized_unique(make_user):
    make_user("Guru.Satu")
    assert User.objects.filter(username="guru.satu").exists()
    with pytest.raises(IntegrityError):
        make_user("GURU.SATU")

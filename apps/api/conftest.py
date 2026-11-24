"""Shared fixtures and authorization test helpers (F1-14)."""

import pytest
from rest_framework.test import APIClient

from modules.accounts.models import AccountStatus, Role, User, UserRole
from modules.accounts.seeding import seed_roles_and_permissions

PASSWORD = "Sandi-Test-2026!"


@pytest.fixture(autouse=True)
def _reference_data(db):
    seed_roles_and_permissions()


@pytest.fixture
def make_user(db):
    def _make(username="user", roles=(), password=PASSWORD, status=AccountStatus.ACTIVE, **extra):
        user = User.objects.create_user(username, password, account_status=status, is_active=status == AccountStatus.ACTIVE, **extra)
        for code in roles:
            UserRole.objects.create(user=user, role=Role.objects.get(code=code))
        return user

    return _make


@pytest.fixture
def client():
    return APIClient()


@pytest.fixture
def csrf_client():
    """Client that enforces CSRF like a real browser."""
    return APIClient(enforce_csrf_checks=True)


@pytest.fixture
def as_role(make_user):
    """Return an authenticated APIClient for a fresh user holding the given roles."""
    counter = {"n": 0}

    def _as(*roles, **extra):
        counter["n"] += 1
        user = make_user(f"u{counter['n']}_{'_'.join(r.lower() for r in roles) or 'none'}", roles=roles, **extra)
        api = APIClient()
        api.force_authenticate(user)
        api.user = user
        return api

    return _as


def assert_role_matrix(as_role, method, url, *, allowed, denied, data=None, ok_status=(200, 201, 202, 204)):
    """Authorization matrix helper: every `allowed` role succeeds, every `denied` role gets 403."""
    for role in allowed:
        response = getattr(as_role(role), method)(url, data, format="json")
        assert response.status_code in ok_status, (role, response.status_code, response.content[:300])
    for role in denied:
        response = getattr(as_role(role), method)(url, data, format="json")
        assert response.status_code == 403, (role, response.status_code, response.content[:300])
        assert response.json()["error"]["code"] == "PERMISSION_DENIED"

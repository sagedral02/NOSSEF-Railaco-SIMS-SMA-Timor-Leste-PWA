"""Role allow/deny matrix (F1 exit criteria) and privilege-escalation guards."""

import pytest

from conftest import assert_role_matrix
from modules.accounts.catalog import PERMISSIONS, ROLES
from modules.accounts.models import Role
from modules.accounts.seeding import seed_roles_and_permissions
from modules.audit.models import AuditLog

pytestmark = pytest.mark.django_db

STAFF_ROLES = [r for r in ROLES if r not in {"SUPER_ADMIN"}]


def test_role_catalog_references_only_canonical_permissions():
    for code, (_, perms) in ROLES.items():
        unknown = set(perms) - set(PERMISSIONS)
        assert not unknown, (code, unknown)


def test_super_admin_has_every_permission(as_role):
    api = as_role("SUPER_ADMIN")
    assert api.user.capabilities == frozenset(PERMISSIONS)


def test_user_without_roles_has_nothing(as_role):
    api = as_role()
    assert api.user.capabilities == frozenset()
    assert api.get("/api/v1/users/").status_code == 403
    assert api.get("/api/v1/audit-logs/").status_code == 403


def test_user_admin_matrix(as_role):
    assert_role_matrix(
        as_role,
        "get",
        "/api/v1/users/",
        allowed=["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL"],
        denied=["TEACHER", "HOMEROOM_TEACHER", "FINANCE_ADMIN", "COUNSELOR", "STUDENT", "GUARDIAN", "STAFF"],
    )


def test_audit_matrix(as_role):
    assert_role_matrix(
        as_role,
        "get",
        "/api/v1/audit-logs/",
        allowed=["SUPER_ADMIN", "PRINCIPAL"],
        denied=["SCHOOL_ADMIN", "TEACHER", "FINANCE_ADMIN", "STUDENT", "GUARDIAN"],
    )


def test_school_settings_matrix(as_role):
    for role in ROLES:
        assert as_role(role).get("/api/v1/school/profile/").status_code == 200
    assert_role_matrix(
        as_role,
        "patch",
        "/api/v1/school/profile/",
        data={"phone": "+670 7000"},
        allowed=["SUPER_ADMIN"],
        denied=["SCHOOL_ADMIN", "PRINCIPAL", "TEACHER", "STUDENT", "GUARDIAN"],
    )


def test_school_admin_cannot_grant_super_admin(as_role, make_user):
    api = as_role("SCHOOL_ADMIN")
    target = make_user("calon")
    response = api.post(f"/api/v1/users/{target.pk}/roles/", {"role": "SUPER_ADMIN"}, format="json")
    assert response.status_code == 403
    ok = api.post(f"/api/v1/users/{target.pk}/roles/", {"role": "TEACHER"}, format="json")
    assert ok.status_code == 200 and ok.json()["data"]["roles"] == ["TEACHER"]
    assert AuditLog.objects.filter(event_type="ROLE_ASSIGNED", resource_id=str(target.pk)).exists()


def test_duplicate_active_role_rejected(as_role, make_user):
    api = as_role("SUPER_ADMIN")
    target = make_user("calon", roles=["TEACHER"])
    response = api.post(f"/api/v1/users/{target.pk}/roles/", {"role": "TEACHER"}, format="json")
    assert response.status_code == 409


def test_role_removal_and_reassignment(as_role, make_user):
    api = as_role("SUPER_ADMIN")
    target = make_user("calon", roles=["TEACHER"])
    assert api.delete(f"/api/v1/users/{target.pk}/roles/TEACHER/").status_code == 200
    assert api.post(f"/api/v1/users/{target.pk}/roles/", {"role": "TEACHER"}, format="json").status_code == 200
    assert target.user_roles.count() == 2  # history kept, one active


def test_last_super_admin_cannot_be_removed(as_role):
    api = as_role("SUPER_ADMIN")
    response = api.delete(f"/api/v1/users/{api.user.pk}/roles/SUPER_ADMIN/")
    assert response.status_code == 409


def test_permission_change_is_audited_and_guarded(as_role):
    api = as_role("SUPER_ADMIN")
    staff = Role.objects.get(code="STAFF")
    response = api.put(
        f"/api/v1/roles/{staff.pk}/permissions/",
        {"permissions": ["announcement.view", "library.view"]},
        format="json",
    )
    assert response.status_code == 200
    assert response.json()["data"]["permissions"] == ["announcement.view", "library.view"]
    assert AuditLog.objects.filter(event_type="PERMISSION_CHANGED", resource_id=str(staff.pk)).exists()

    sa = Role.objects.get(code="SUPER_ADMIN")
    assert api.put(f"/api/v1/roles/{sa.pk}/permissions/", {"permissions": []}, format="json").status_code == 409
    bad = api.put(f"/api/v1/roles/{staff.pk}/permissions/", {"permissions": ["x.y"]}, format="json")
    assert bad.status_code == 400 and "permissions" in bad.json()["error"]["fields"]


def test_seed_is_idempotent_and_preserves_runtime_changes(as_role):
    api = as_role("SUPER_ADMIN")
    staff = Role.objects.get(code="STAFF")
    api.put(f"/api/v1/roles/{staff.pk}/permissions/", {"permissions": ["library.view"]}, format="json")
    summary = seed_roles_and_permissions()
    assert summary == {"permissions_created": 0, "roles_created": 0, "grants_added": 0}
    assert list(staff.role_permissions.values_list("permission__code", flat=True)) == ["library.view"]
    seed_roles_and_permissions(reset=True)
    assert list(staff.role_permissions.values_list("permission__code", flat=True)) == ["announcement.view"]


def test_user_create_and_list(as_role):
    api = as_role("SCHOOL_ADMIN")
    response = api.post(
        "/api/v1/users/",
        {"username": "Guru.Baru", "full_name": "Guru Baru", "password": "Rahasia-Kuat-2026", "roles": ["TEACHER"]},
        format="json",
    )
    assert response.status_code == 201, response.content
    assert response.json()["data"]["username"] == "guru.baru"
    listing = api.get("/api/v1/users/?q=baru")
    assert listing.json()["meta"]["count"] == 1
    no_password = api.post("/api/v1/users/", {"username": "tanpa.sandi"}, format="json")
    assert no_password.json()["data"]["account_status"] == "CREATED"
    assert no_password.json()["data"]["is_active"] is False

"""Idempotent seeding of the permission catalog and default roles (F1-03, PRD §53.1).

Re-running never overwrites runtime adjustments made by SUPER_ADMIN: default grants are applied only
for roles created in this run, or for permission codes that did not exist before this run.
`reset=True` restores the documented default mapping exactly.
"""

from django.db import transaction

from .catalog import PERMISSIONS, ROLES
from .models import Permission, Role, RolePermission


@transaction.atomic
def seed_roles_and_permissions(*, reset=False):
    new_codes = set()
    perms = {}
    for code, description in PERMISSIONS.items():
        perm, created = Permission.objects.get_or_create(code=code, defaults={"description": description})
        if not created and perm.description != description:
            perm.description = description
            perm.save(update_fields=["description"])
        if created:
            new_codes.add(code)
        perms[code] = perm

    summary = {"permissions_created": len(new_codes), "roles_created": 0, "grants_added": 0}
    for code, (name, granted) in ROLES.items():
        role, created = Role.objects.get_or_create(code=code, defaults={"name": name})
        if created:
            summary["roles_created"] += 1
        elif role.name != name:
            role.name = name
            role.save(update_fields=["name"])
        if reset:
            RolePermission.objects.filter(role=role).exclude(permission__code__in=granted).delete()
        to_grant = granted if (created or reset) else [c for c in granted if c in new_codes]
        existing = set(RolePermission.objects.filter(role=role).values_list("permission__code", flat=True))
        rows = [RolePermission(role=role, permission=perms[c]) for c in set(to_grant) - existing]
        RolePermission.objects.bulk_create(rows)
        summary["grants_added"] += len(rows)
    return summary

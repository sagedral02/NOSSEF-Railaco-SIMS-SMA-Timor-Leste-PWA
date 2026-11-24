"""Seeding framework (F0-15). Reference seeders are idempotent and safe in production;
demo seeders create synthetic data and refuse to run outside local/test settings."""

from django.conf import settings
from django.core.management.base import CommandError


def run_reference_seeders(*, reset_roles=False):
    from modules.accounts.seeding import seed_roles_and_permissions
    from modules.school.services import get_profile

    yield "roles_permissions", seed_roles_and_permissions(reset=reset_roles)
    profile = get_profile()
    yield "school_profile", {"name": profile.name}
    for name, seeder in _extra_reference_seeders():
        yield name, seeder()


def _extra_reference_seeders():
    """Domain modules register reference seeders here as phases land (grade levels, majors, ...)."""
    seeders = []
    for dotted in getattr(settings, "REFERENCE_SEEDERS", []):
        module_path, _, func = dotted.rpartition(".")
        module = __import__(module_path, fromlist=[func])
        seeders.append((func, getattr(module, func)))
    return seeders


def assert_demo_allowed():
    module = settings.SETTINGS_MODULE or ""
    if not (module.endswith(".local") or module.endswith(".test")):
        raise CommandError("Demo data hanya boleh dibuat pada settings local/test (PRD §53.2, §72.2).")

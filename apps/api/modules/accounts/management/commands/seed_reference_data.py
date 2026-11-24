"""Idempotently seed reference data (PRD §53.1–53.2). Safe to run on every deploy."""

from django.core.management.base import BaseCommand

from common.seeding import run_reference_seeders


class Command(BaseCommand):
    help = "Seed canonical roles/permissions and reference rows idempotently."

    def add_arguments(self, parser):
        parser.add_argument(
            "--reset-role-permissions",
            action="store_true",
            help="Restore the documented default role→permission mapping (overwrites runtime changes).",
        )

    def handle(self, *args, **options):
        for name, summary in run_reference_seeders(reset_roles=options["reset_role_permissions"]):
            self.stdout.write(self.style.SUCCESS(f"{name}: {summary}"))

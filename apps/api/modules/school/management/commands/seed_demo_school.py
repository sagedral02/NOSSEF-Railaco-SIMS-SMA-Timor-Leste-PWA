"""Synthetic demo school for local development (PRD §53.2). Refuses to run outside local/test."""

from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand

from common.seeding import assert_demo_allowed


class Command(BaseCommand):
    help = "Create synthetic demo users/classes/data (local only)."

    def handle(self, *args, **options):
        assert_demo_allowed()
        call_command("seed_reference_data", stdout=self.stdout)
        for dotted in settings.DEMO_SEEDERS:
            module_path, _, func = dotted.rpartition(".")
            module = __import__(module_path, fromlist=[func])
            summary = getattr(module, func)()
            self.stdout.write(self.style.SUCCESS(f"{func}: {summary}"))

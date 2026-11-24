"""Retention cleanup for generated exports (PRD F13-11)."""

from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Expire report/export files older than the retention window"

    def add_arguments(self, parser):
        parser.add_argument("--days", type=int, default=None)

    def handle(self, *args, **opts):
        from modules.reports.services import expire_old

        self.stdout.write(f"expired={expire_old(opts['days'])}")

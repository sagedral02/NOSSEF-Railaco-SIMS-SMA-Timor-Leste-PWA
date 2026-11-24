"""Run automated data-integrity invariants (PRD §54). Exits non-zero when a critical check fails."""

import sys

from django.conf import settings
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Run INT-xxx integrity checks; non-zero exit on failure."

    def handle(self, *args, **options):
        failures = 0
        for dotted in settings.INTEGRITY_CHECKS:
            module_path, _, func = dotted.rpartition(".")
            module = __import__(module_path, fromlist=[func])
            code, ok, detail = getattr(module, func)()
            style = self.style.SUCCESS if ok else self.style.ERROR
            self.stdout.write(style(f"[{'OK' if ok else 'FAIL'}] {code} {detail}"))
            failures += 0 if ok else 1
        if failures:
            self.stderr.write(self.style.ERROR(f"{failures} integrity check(s) failed."))
            sys.exit(1)

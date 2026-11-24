"""Local/test only: remove today's attendance sessions so end-to-end tests can run repeatedly."""

from django.core.management.base import BaseCommand
from django.utils import timezone

from common.seeding import assert_demo_allowed
from modules.attendance.models import AttendanceCorrection, AttendanceRecord, AttendanceSession, OfflineMutationReceipt


class Command(BaseCommand):
    help = "Delete today's attendance sessions (local/test settings only)."

    def handle(self, *args, **options):
        assert_demo_allowed()
        sessions = AttendanceSession.objects.filter(date=timezone.localdate())
        AttendanceCorrection.objects.filter(attendance_record__session__in=sessions).delete()
        OfflineMutationReceipt.objects.filter(resource_id__in=AttendanceRecord.objects.filter(session__in=sessions).values("id")).delete()
        n = sessions.count()
        sessions.delete()
        self.stdout.write(self.style.SUCCESS(f"deleted {n} session(s) for today"))

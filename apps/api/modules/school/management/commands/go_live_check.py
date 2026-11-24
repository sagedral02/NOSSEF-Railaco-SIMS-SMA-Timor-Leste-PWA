"""Go-live readiness gate (PRD F14/F15): configuration, master data, accounts and reconciliation in one report.

python manage.py go_live_check            # human-readable report, non-zero exit when a blocking gate fails
python manage.py go_live_check --strict   # also treat warnings as failures (use before the production cut-over)
"""

import sys

from django.conf import settings
from django.core.management.base import BaseCommand
from django.db.models import Count, Q

DEMO_USERNAMES = {
    "admin",
    "sekretaria",
    "cristina.amaral",
    "maria.martins",
    "antonio.soares",
    "agostinho.freitas",
    "finansas",
    "admisaun",
    "konselora",
    "biblioteka",
    "patrimoniu",
    "estudante",
    "inan-aman",
}


class Command(BaseCommand):
    help = "Check go-live gates (config, academic year, master data, accounts, integrity)."

    def add_arguments(self, parser):
        parser.add_argument("--strict", action="store_true")

    def handle(self, *args, strict=False, **options):
        from modules.academics.models import AcademicYear, ClassRoom, TeachingAssignment
        from modules.academics.services import readiness
        from modules.accounts.models import User, UserRole
        from modules.finance.models import FeePlan
        from modules.schedules.models import ScheduleEntry
        from modules.school.services import get_profile
        from modules.students.models import Student, StudentEnrollment

        gates = []  # (level, code, ok, detail) — level: BLOCK or WARN

        def gate(level, code, ok, detail=""):
            gates.append((level, code, bool(ok), detail))

        # Configuration
        gate("BLOCK", "debug_off", not settings.DEBUG, f"DEBUG={settings.DEBUG}")
        gate("BLOCK", "secret_key", len(settings.SECRET_KEY) >= 50 and "insecure" not in settings.SECRET_KEY, "length >= 50, not a dev key")
        gate("BLOCK", "allowed_hosts", bool(settings.ALLOWED_HOSTS) and "*" not in settings.ALLOWED_HOSTS, ",".join(settings.ALLOWED_HOSTS))
        gate(
            "BLOCK", "secure_cookies", getattr(settings, "SESSION_COOKIE_SECURE", False) and getattr(settings, "CSRF_COOKIE_SECURE", False)
        )
        gate("BLOCK", "tasks_async", not getattr(settings, "CELERY_TASK_ALWAYS_EAGER", False), "Celery worker required in production")
        gate("WARN", "hsts", getattr(settings, "SECURE_HSTS_SECONDS", 0) >= 31536000, f"{getattr(settings, 'SECURE_HSTS_SECONDS', 0)}s")
        gate(
            "WARN",
            "email",
            not settings.FEATURE_FLAGS.get("ENABLE_EMAIL") or settings.EMAIL_BACKEND.endswith("smtp.EmailBackend"),
            settings.EMAIL_BACKEND,
        )
        gate(
            "WARN",
            "web_push",
            not settings.FEATURE_FLAGS.get("ENABLE_WEB_PUSH") or bool(settings.VAPID_PRIVATE_KEY),
            "VAPID keys when push enabled",
        )
        gate("WARN", "school_profile", get_profile().name and get_profile().name != "SMA", get_profile().name)

        # Academic year (F15-03/04)
        year = AcademicYear.objects.filter(is_current=True).first()
        gate("BLOCK", "current_year", year is not None and year.status == "ACTIVE", year.name if year else "none")
        if year:
            for c in readiness(year):
                gate(
                    "BLOCK" if c["code"] in {"three_trimesters", "cau_mapping", "classrooms", "dates_valid"} else "WARN",
                    f"year.{c['code']}",
                    c["ok"],
                    c.get("detail", ""),
                )
            no_homeroom = ClassRoom.objects.filter(academic_year=year, active=True, homeroom_teacher__isnull=True).count()
            gate("WARN", "homeroom_teachers", no_homeroom == 0, f"{no_homeroom} rombel tanpa wali kelas")
            no_sched = (
                TeachingAssignment.objects.filter(academic_year=year, active=True)
                .annotate(n=Count("schedule_entries", filter=Q(schedule_entries__active=True)))
                .filter(n=0)
                .count()
            )
            gate(
                "WARN",
                "schedules",
                no_sched == 0 and ScheduleEntry.objects.filter(academic_year=year, active=True).exists(),
                f"{no_sched} penugasan tanpa jadwal",
            )
            active = Student.objects.filter(status="ACTIVE").count()
            enrolled = StudentEnrollment.objects.filter(academic_year=year, status="ACTIVE").values("student").distinct().count()
            gate("BLOCK", "students_enrolled", active > 0 and enrolled == active, f"{enrolled}/{active} siswa aktif punya rombel")
            gate(
                "WARN",
                "spp_plans",
                FeePlan.objects.filter(academic_year=year, status="ACTIVE", fee_type__code="SPP").exists(),
                "tarif SPP aktif",
            )

        # Accounts (F15-06)
        live_demo = User.objects.filter(username__in=DEMO_USERNAMES, is_active=True).exclude(username="admin").count()
        gate("BLOCK", "no_demo_accounts", live_demo == 0, f"{live_demo} akun demo aktif")
        supers = User.objects.filter(is_superuser=True, is_active=True).count()
        gate("WARN", "superusers", 1 <= supers <= 2, f"{supers} superuser aktif")
        admins = (
            UserRole.objects.filter(role__code__in=["SUPER_ADMIN", "SCHOOL_ADMIN"], revoked_at__isnull=True, user__is_active=True)
            .values("user")
            .distinct()
            .count()
        )
        gate("BLOCK", "school_admin_exists", admins >= 1, f"{admins} admin")
        no_role = (
            User.objects.filter(is_active=True)
            .annotate(n=Count("user_roles", filter=Q(user_roles__revoked_at__isnull=True)))
            .filter(n=0)
            .count()
        )
        gate("WARN", "users_have_roles", no_role == 0, f"{no_role} akun aktif tanpa peran")

        # Integrity (F15-07)
        failed = []
        for dotted in settings.INTEGRITY_CHECKS:
            module_path, _, func = dotted.rpartition(".")
            code, ok, _detail = getattr(__import__(module_path, fromlist=[func]), func)()
            if not ok:
                failed.append(code)
        gate("BLOCK", "integrity", not failed, ", ".join(failed) or "INT-001..025 OK")

        blocking = 0
        for level, code, ok, detail in gates:
            bad = not ok and (level == "BLOCK" or strict)
            blocking += bad
            mark = "OK  " if ok else ("FAIL" if bad else "WARN")
            style = self.style.SUCCESS if ok else (self.style.ERROR if bad else self.style.WARNING)
            self.stdout.write(style(f"[{mark}] {code:<34} {detail}"))
        if blocking:
            self.stderr.write(self.style.ERROR(f"{blocking} go-live gate(s) failing."))
            sys.exit(1)
        self.stdout.write(self.style.SUCCESS("All blocking go-live gates pass."))

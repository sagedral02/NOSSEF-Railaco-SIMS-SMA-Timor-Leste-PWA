"""Shared settings for every environment (PRD §8, §13, §36.4)."""

from pathlib import Path

from config.env import database_from_url, env, env_bool, env_list

BASE_DIR = Path(__file__).resolve().parent.parent.parent  # apps/api
REPO_ROOT = BASE_DIR.parent.parent

SECRET_KEY = env("DJANGO_SECRET_KEY")
DEBUG = False
ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1")
CSRF_TRUSTED_ORIGINS = env_list("DJANGO_CSRF_TRUSTED_ORIGINS", "")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.postgres",
    "rest_framework",
    "django_filters",
    "drf_spectacular",
    "common",
    "modules.audit",
    "modules.accounts",
    "modules.school",
    "modules.staff",
    "modules.academics",
    "modules.documents",
    "modules.students",
    "modules.admissions",
    "modules.schedules",
    "modules.attendance",
    "modules.assessments",
    "modules.report_cards",
    "modules.national_exams",
    "modules.finance",
    "modules.counseling",
    "modules.extracurricular",
    "modules.library",
    "modules.assets",
    "modules.communications",
    "modules.reports",
    "modules.integrations",
]

MIDDLEWARE = [
    "common.api.middleware.RequestIdMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

DATABASES = {"default": database_from_url(env("DATABASE_URL"))}
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

AUTH_USER_MODEL = "accounts.User"
AUTHENTICATION_BACKENDS = ["django.contrib.auth.backends.ModelBackend"]
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 10}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]
PASSWORD_RESET_TIMEOUT = 60 * 60  # single-use Django token, 1 hour

# --- Session / CSRF (PRD §13, ADR-004) ---
SESSION_ENGINE = "django.contrib.sessions.backends.db"
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_AGE = 60 * 60 * 12
CSRF_COOKIE_HTTPONLY = False  # SPA reads the token and echoes it in X-CSRFToken
CSRF_COOKIE_SAMESITE = "Lax"
CSRF_FAILURE_VIEW = "common.api.views.csrf_failure"

# --- i18n / time (PRD §2) ---
LANGUAGE_CODE = "id"
LANGUAGES = [("tet", "Tetun"), ("pt", "Português"), ("id", "Bahasa Indonesia")]
TIME_ZONE = "Asia/Dili"
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

# Private file storage (PRD §31, ADR-010). Local dev uses a filesystem backend behind the same
# abstraction; nothing under PRIVATE_STORAGE_ROOT is ever served directly.
PRIVATE_STORAGE_ROOT = Path(env("PRIVATE_STORAGE_ROOT", str(BASE_DIR / "var" / "private")))
STORAGES = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
        "OPTIONS": {"location": str(PRIVATE_STORAGE_ROOT), "base_url": None},
    },
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
}
MAX_UPLOAD_BYTES = int(env("MAX_UPLOAD_BYTES", str(5 * 1024 * 1024)))
DATA_UPLOAD_MAX_MEMORY_SIZE = 20 * 1024 * 1024

# --- DRF (PRD §11, §46) ---
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["common.api.authentication.SessionAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_RENDERER_CLASSES": ["common.api.renderers.EnvelopeJSONRenderer"],
    "DEFAULT_PARSER_CLASSES": [
        "rest_framework.parsers.JSONParser",
        "rest_framework.parsers.MultiPartParser",
        "rest_framework.parsers.FormParser",
    ],
    "DEFAULT_PAGINATION_CLASS": "common.api.pagination.StandardPagination",
    "PAGE_SIZE": 25,
    "DEFAULT_FILTER_BACKENDS": ["django_filters.rest_framework.DjangoFilterBackend"],
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "EXCEPTION_HANDLER": "common.api.exceptions.exception_handler",
    "DEFAULT_THROTTLE_RATES": {
        "login": env("THROTTLE_LOGIN", "10/min"),
        "password_reset": env("THROTTLE_PASSWORD_RESET", "5/hour"),
        "public_form": env("THROTTLE_PUBLIC_FORM", "30/hour"),
    },
    "COERCE_DECIMAL_TO_STRING": True,
    "DATETIME_FORMAT": "iso-8601",
    "DATE_FORMAT": "iso-8601",
    "UNAUTHENTICATED_USER": "django.contrib.auth.models.AnonymousUser",
    "TEST_REQUEST_DEFAULT_FORMAT": "json",
}

SPECTACULAR_SETTINGS = {
    "TITLE": "SIMS SMA Timor-Leste — NOSSEF API",
    "DESCRIPTION": "Canonical REST API (PRD §46–§48). Envelope: {data, meta} / {error}.",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "SCHEMA_PATH_PREFIX": r"/api/v1",
    "COMPONENT_SPLIT_REQUEST": True,
    "ENUM_NAME_OVERRIDES": {"LocaleEnum": "modules.accounts.models.Locale"},
}

# --- Celery (PRD §37, ADR-011) ---
DEV_SYNC_TASKS = False
CELERY_BROKER_URL = env("REDIS_URL", "redis://localhost:6379/0")
CELERY_RESULT_BACKEND = None
CELERY_TASK_ACKS_LATE = True
CELERY_TASK_REJECT_ON_WORKER_LOST = True
CELERY_WORKER_PREFETCH_MULTIPLIER = 1
CELERY_TASK_DEFAULT_QUEUE = "default"
CELERY_TASK_ROUTES = {
    "modules.communications.tasks.*": {"queue": "notifications"},
    "modules.reports.tasks.*": {"queue": "reports"},
    "modules.integrations.tasks.*": {"queue": "imports"},
    "modules.finance.tasks.*": {"queue": "finance"},
    "modules.maintenance.tasks.*": {"queue": "maintenance"},
}
CELERY_TIMEZONE = TIME_ZONE
CELERY_BEAT_SCHEDULE = {
    "library-mark-overdue": {"task": "modules.library.tasks.mark_overdue_loans", "schedule": 3600.0},
    "announcements-publish-scheduled": {"task": "modules.communications.tasks.publish_scheduled_announcements", "schedule": 60.0},
    "finance-overdue-reminders": {"task": "modules.communications.tasks.notify_overdue_invoices", "schedule": 86400.0},
    "reports-expire-exports": {"task": "modules.reports.tasks.expire_generated_exports", "schedule": 21600.0},
}
LIBRARY_LOAN_DAYS = int(env("LIBRARY_LOAN_DAYS", "7"))
LIBRARY_MAX_RENEWALS = 2
REPORT_RETENTION_DAYS = int(env("REPORT_RETENTION_DAYS", "7"))
LIBRARY_FINE_PER_DAY = env("LIBRARY_FINE_PER_DAY", "0.00")

EMAIL_BACKEND = env("EMAIL_BACKEND", "django.core.mail.backends.console.EmailBackend")
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", "no-reply@nossef.local")
EMAIL_HOST = env("EMAIL_HOST", "localhost")
EMAIL_PORT = int(env("EMAIL_PORT", "587"))
EMAIL_HOST_USER = env("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = env("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = env_bool("EMAIL_USE_TLS", True)
WEB_APP_URL = env("WEB_APP_URL", "http://localhost:3000")

# Feature flags (PRD §60.2)
FEATURE_FLAGS = {
    "ENABLE_LIBRARY": env_bool("ENABLE_LIBRARY", True),
    "ENABLE_ASSETS": env_bool("ENABLE_ASSETS", True),
    "ENABLE_EXTRACURRICULAR": env_bool("ENABLE_EXTRACURRICULAR", True),
    "ENABLE_STAFF_ATTENDANCE": env_bool("ENABLE_STAFF_ATTENDANCE", True),
    "ENABLE_WEB_PUSH": env_bool("ENABLE_WEB_PUSH", False),
    "ENABLE_EMAIL": env_bool("ENABLE_EMAIL", False),
}

# Web Push (PRD §30.4). Keys are optional locally; `manage.py generate_vapid_keys` prints a pair for .env.
VAPID_PUBLIC_KEY = env("VAPID_PUBLIC_KEY", "")
VAPID_PRIVATE_KEY = env("VAPID_PRIVATE_KEY", "")
VAPID_SUBJECT = env("VAPID_SUBJECT", "mailto:admin@nossef.local")
# Fernet key for secrets at rest (push endpoints). Derived from SECRET_KEY when not set explicitly.
FIELD_ENCRYPTION_KEY = env("FIELD_ENCRYPTION_KEY", "")

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "filters": {"request_id": {"()": "common.api.logging.RequestIdFilter"}},
    "formatters": {"json": {"()": "common.api.logging.JsonFormatter"}},
    "handlers": {
        "console": {"class": "logging.StreamHandler", "formatter": "json", "filters": ["request_id"]},
    },
    "root": {"handlers": ["console"], "level": env("LOG_LEVEL", "INFO")},
    "loggers": {
        "django.request": {"handlers": ["console"], "level": "WARNING", "propagate": False},
        "django.server": {"handlers": ["console"], "level": "WARNING", "propagate": False},
    },
}

# Registries filled as roadmap phases land (PRD §53, §54).
REFERENCE_SEEDERS = [
    "modules.academics.seeding.seed_academic_reference",
    "modules.assessments.seeding.seed_assessment_types",
    "modules.finance.seeding.seed_fee_types",
]
DEMO_SEEDERS = [
    "modules.accounts.demo.seed_demo_users",
    "modules.academics.seeding.seed_demo_academics",
    "modules.students.demo.seed_demo_students",
    "modules.admissions.demo.seed_demo_admissions",
    "modules.schedules.demo.seed_demo_schedules",
    "modules.attendance.demo.seed_demo_attendance",
    "modules.assessments.seeding.seed_demo_grades",
    "modules.finance.seeding.seed_demo_finance",
    "modules.counseling.seeding.seed_demo_counseling",
    "modules.extracurricular.seeding.seed_demo_extracurricular",
    "modules.extracurricular.seeding.seed_demo_programs",
    "modules.library.seeding.seed_demo_library",
    "modules.assets.seeding.seed_demo_assets",
]
INTEGRITY_CHECKS = [
    "modules.school.integrity.int_001_single_school_profile",
    "modules.academics.integrity.int_002_single_current_year",
    "modules.academics.integrity.int_003_active_year_three_trimesters",
    "modules.academics.integrity.int_004_cau_and_dates",
    "modules.students.integrity.int_005_single_active_enrollment",
    "modules.students.integrity.int_006_enrollment_matches_classroom",
    "modules.academics.integrity.int_007_unique_classroom_codes",
    "modules.schedules.integrity.int_008_no_schedule_collisions",
    "modules.attendance.integrity.int_009_attendance_student_enrolled",
    "modules.attendance.integrity.int_010_unique_attendance_record",
    "modules.assessments.integrity.int_011_cau_matches_trimester",
    "modules.assessments.integrity.int_012_active_scheme_weights",
    "modules.assessments.integrity.int_013_score_within_range",
    "modules.assessments.integrity.int_014_finalized_has_final_score",
    "modules.assessments.integrity.int_015_published_report_complete",
    "modules.finance.integrity.int_017_invoice_total_matches_items",
    "modules.finance.integrity.int_018_paid_matches_allocations",
    "modules.finance.integrity.int_019_no_negative_balance",
    "modules.finance.integrity.int_020_allocations_within_payment",
    "modules.finance.integrity.int_021_reversed_not_counted",
    "modules.school.integrity.int_025_no_active_role_on_inactive_user",
]

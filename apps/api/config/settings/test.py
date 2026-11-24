"""Settings for the automated test suite (PRD §45)."""

from pathlib import Path

from config.env import load_dotenv

load_dotenv(Path(__file__).resolve().parents[4] / ".env")

from .base import *  # noqa: E402,F403

DEBUG = False
DEV_SYNC_TASKS = True
CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = True
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
PRIVATE_STORAGE_ROOT = BASE_DIR / "var" / "test-private"  # noqa: F405
STORAGES["default"]["OPTIONS"]["location"] = str(PRIVATE_STORAGE_ROOT)  # noqa: F405
REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"] = {  # noqa: F405
    "login": "1000/min",
    "password_reset": "1000/min",
    "public_form": "1000/min",
}
LOGGING["root"]["level"] = "WARNING"  # noqa: F405

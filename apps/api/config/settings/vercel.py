"""Vercel serverless profile: production security, no Redis/Celery worker, ephemeral /tmp storage."""

from pathlib import Path

from config.env import env

from .production import *  # noqa: F403

# No broker on Vercel: background tasks run inline inside the request (PRD §52.2 fallback).
DEV_SYNC_TASKS = True
CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = True

# Vercel terminates TLS at the edge; functions are short-lived, so no persistent connections.
SECURE_SSL_REDIRECT = False
DATABASES["default"]["CONN_MAX_AGE"] = 0  # noqa: F405
DATABASES["default"]["OPTIONS"] = {"sslmode": "require"}  # noqa: F405
DATABASES["default"]["DISABLE_SERVER_SIDE_CURSORS"] = True  # Neon pooler = PgBouncer transaction mode  # noqa: F405

# Only /tmp is writable on Vercel and it is not persistent; configure S3_BUCKET for durable files.
if not env("S3_BUCKET", ""):
    PRIVATE_STORAGE_ROOT = Path("/tmp/nossef-private")
    STORAGES["default"]["OPTIONS"]["location"] = str(PRIVATE_STORAGE_ROOT)  # noqa: F405

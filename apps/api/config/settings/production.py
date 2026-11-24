"""Production settings (PRD §13.1, §38, §42). Every secret comes from the environment."""

from config.env import env, env_bool

from .base import *  # noqa: F403

DEBUG = False
DEV_SYNC_TASKS = False
if not ALLOWED_HOSTS:  # noqa: F405
    raise RuntimeError("DJANGO_ALLOWED_HOSTS must be set in production.")

SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = env_bool("DJANGO_SECURE_SSL_REDIRECT", True)
SECURE_HSTS_SECONDS = int(env("DJANGO_HSTS_SECONDS", "0"))  # enable once HTTPS is proven stable
SECURE_HSTS_INCLUDE_SUBDOMAINS = SECURE_HSTS_SECONDS > 0
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
X_FRAME_OPTIONS = "DENY"
CELERY_TASK_ALWAYS_EAGER = False
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SAMESITE = "Lax"
CSRF_TRUSTED_ORIGINS = [o for o in env("DJANGO_CSRF_TRUSTED_ORIGINS", "").split(",") if o]

# Celery limits (F14-04): bounded memory and runaway-task protection per queue.
CELERY_WORKER_MAX_TASKS_PER_CHILD = int(env("CELERY_MAX_TASKS_PER_CHILD", "200"))
CELERY_TASK_TIME_LIMIT = int(env("CELERY_TASK_TIME_LIMIT", "900"))
CELERY_TASK_SOFT_TIME_LIMIT = int(env("CELERY_TASK_SOFT_TIME_LIMIT", "840"))
CELERY_BROKER_CONNECTION_RETRY_ON_STARTUP = True

# Private object storage (F14-05): S3-compatible bucket when configured (requires django-storages + boto3),
# otherwise the private filesystem root on a persistent, backed-up volume. Files are always streamed through the API.
if env("S3_BUCKET", ""):
    STORAGES["default"] = {  # noqa: F405
        "BACKEND": "storages.backends.s3.S3Storage",
        "OPTIONS": {
            "bucket_name": env("S3_BUCKET"),
            "endpoint_url": env("S3_ENDPOINT_URL", "") or None,
            "region_name": env("S3_REGION", "") or None,
            "access_key": env("S3_ACCESS_KEY_ID", ""),
            "secret_key": env("S3_SECRET_ACCESS_KEY", ""),
            "default_acl": "private",
            "querystring_auth": True,
            "querystring_expire": 300,
            "file_overwrite": False,
        },
    }

# Error monitoring (F14-06): optional Sentry with PII scrubbing; structured JSON logs go to stdout regardless.
if env("SENTRY_DSN", ""):
    try:
        import sentry_sdk
        from sentry_sdk.integrations.celery import CeleryIntegration
        from sentry_sdk.integrations.django import DjangoIntegration

        sentry_sdk.init(
            dsn=env("SENTRY_DSN"),
            integrations=[DjangoIntegration(), CeleryIntegration()],
            send_default_pii=False,
            traces_sample_rate=float(env("SENTRY_TRACES_SAMPLE_RATE", "0.0")),
            environment=env("SENTRY_ENVIRONMENT", "production"),
        )
    except ImportError:  # pragma: no cover - optional dependency
        pass

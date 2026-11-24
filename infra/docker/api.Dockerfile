# Django API / Celery image (PRD §42). Same image runs web (gunicorn), worker and beat.
FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
RUN apt-get update && apt-get install -y --no-install-recommends libpq5 curl && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10001 app
WORKDIR /app
COPY apps/api/requirements/ requirements/
RUN pip install -r requirements/lock.txt && pip install "django-storages[s3]>=1.14,<2" "sentry-sdk>=2,<3"
COPY apps/api/ .
RUN mkdir -p /data/private && chown -R app:app /data /app
USER app
ENV DJANGO_SETTINGS_MODULE=config.settings.production PRIVATE_STORAGE_ROOT=/data/private
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s CMD curl -fsS http://127.0.0.1:8000/api/v1/health/live || exit 1
CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3", "--timeout", "60", "--access-logfile", "-"]

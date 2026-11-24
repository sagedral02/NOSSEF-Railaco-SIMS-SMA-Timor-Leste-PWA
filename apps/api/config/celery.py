"""Celery application (PRD §37). Queues: default, notifications, reports, imports, finance, maintenance."""

import os

from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.local")

app = Celery("nossef")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()

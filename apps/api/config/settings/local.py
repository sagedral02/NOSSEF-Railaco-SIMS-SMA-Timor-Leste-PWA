"""Local developer laptop profile (PRD §52)."""

from pathlib import Path

from config.env import load_dotenv

load_dotenv(Path(__file__).resolve().parents[4] / ".env")

from config.env import env_bool  # noqa: E402

from .base import *  # noqa: E402,F403

DEBUG = True
# PRD §52.2: without Redis/Celery locally, tasks run synchronously only behind this flag.
DEV_SYNC_TASKS = env_bool("DEV_SYNC_TASKS", True)
CELERY_TASK_ALWAYS_EAGER = DEV_SYNC_TASKS
CELERY_TASK_EAGER_PROPAGATES = True

"""Environment helpers. Startup fails fast when a required setting is missing (PRD §36.4)."""

import os
from urllib.parse import unquote, urlparse

from django.core.exceptions import ImproperlyConfigured

_REQUIRED = object()


def env(name, default=_REQUIRED):
    value = os.environ.get(name)
    if value is None or value == "":
        if default is _REQUIRED:
            raise ImproperlyConfigured(f"Environment variable {name} is required.")
        return default
    return value


def env_bool(name, default=False):
    value = os.environ.get(name)
    if value is None or value == "":
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def env_list(name, default=""):
    raw = os.environ.get(name, default) or ""
    return [item.strip() for item in raw.split(",") if item.strip()]


def database_from_url(url):
    """Parse postgres://user:pass@host:port/name into a Django DATABASES entry."""
    parsed = urlparse(url)
    if parsed.scheme not in {"postgres", "postgresql"}:
        raise ImproperlyConfigured("DATABASE_URL must use the postgres:// scheme (PRD §8.1: PostgreSQL).")
    return {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": unquote(parsed.path.lstrip("/")),
        "USER": unquote(parsed.username or ""),
        "PASSWORD": unquote(parsed.password or ""),
        "HOST": parsed.hostname or "localhost",
        "PORT": str(parsed.port or 5432),
        "CONN_MAX_AGE": 60,
        "ATOMIC_REQUESTS": False,
    }


def load_dotenv(path):
    """Minimal .env loader for local development; real environment variables win."""
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))

"""In-process domain events (PRD §49). Handlers run after the surrounding transaction commits.

This is explicitly not an event bus/Kafka: critical state stays in PostgreSQL and is written by
services; handlers only trigger follow-up work (notifications, background tasks).
"""

import logging
from collections import defaultdict

from django.db import transaction

logger = logging.getLogger(__name__)
_handlers = defaultdict(list)


def subscribe(event_name):
    def decorator(func):
        _handlers[event_name].append(func)
        return func

    return decorator


def emit(event_name, **payload):
    """Queue handlers for `event_name` to run on commit. Payload must be IDs/primitives."""

    def _dispatch():
        for handler in list(_handlers.get(event_name, [])):
            try:
                handler(**payload)
            except Exception:  # noqa: BLE001 - one failing subscriber must not break others
                logger.exception("Event handler failed", extra={"event": event_name})

    transaction.on_commit(_dispatch)

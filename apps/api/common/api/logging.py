"""Structured JSON logs carrying the correlation ID (PRD §40). Never log secrets/PII payloads."""

import json
import logging
from datetime import UTC, datetime

from common.context import current_request_id


class RequestIdFilter(logging.Filter):
    def filter(self, record):
        record.request_id = current_request_id()
        return True


class JsonFormatter(logging.Formatter):
    def format(self, record):
        payload = {
            "ts": datetime.now(UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": getattr(record, "request_id", None),
        }
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)

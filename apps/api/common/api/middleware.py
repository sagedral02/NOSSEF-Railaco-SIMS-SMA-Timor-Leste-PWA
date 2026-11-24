"""Request/correlation ID middleware (PRD §11.1, F0-09, F1-08)."""

import uuid

from common.context import client_ip_var, request_id_var, user_agent_var


def _valid_uuid(value):
    try:
        return str(uuid.UUID(str(value)))
    except (ValueError, TypeError):
        return None


class RequestIdMiddleware:
    header = "HTTP_X_REQUEST_ID"

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request_id = _valid_uuid(request.META.get(self.header)) or str(uuid.uuid4())
        request.request_id = request_id
        tokens = [
            request_id_var.set(request_id),
            client_ip_var.set(request.META.get("REMOTE_ADDR")),
            user_agent_var.set((request.META.get("HTTP_USER_AGENT") or "")[:255]),
        ]
        try:
            response = self.get_response(request)
        finally:
            for var, token in zip((request_id_var, client_ip_var, user_agent_var), tokens, strict=True):
                var.reset(token)
        response["X-Request-ID"] = request_id
        return response

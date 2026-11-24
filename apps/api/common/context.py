"""Per-request context (correlation ID, client metadata) available to logs and audit."""

import contextvars

request_id_var = contextvars.ContextVar("request_id", default=None)
client_ip_var = contextvars.ContextVar("client_ip", default=None)
user_agent_var = contextvars.ContextVar("user_agent", default=None)


def current_request_id():
    return request_id_var.get()

"""drf-spectacular extensions so the OpenAPI schema documents session + CSRF auth (ADR-004)."""

from drf_spectacular.extensions import OpenApiAuthenticationExtension


class SessionCsrfScheme(OpenApiAuthenticationExtension):
    target_class = "common.api.authentication.SessionAuthentication"
    name = "sessionAuth"

    def get_security_definition(self, auto_schema):
        return {"type": "apiKey", "in": "cookie", "name": "sessionid"}

from rest_framework import authentication


class SessionAuthentication(authentication.SessionAuthentication):
    """Django session + CSRF (ADR-004). Advertises a scheme so unauthenticated requests get 401, not 403."""

    def authenticate_header(self, request):
        return "Session"

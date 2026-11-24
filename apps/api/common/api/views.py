"""Transport-level views: CSRF failure in envelope form, health checks (PRD §40)."""

import json

from django.conf import settings
from django.db import connection
from django.http import HttpResponse
from drf_spectacular.utils import extend_schema
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from common.api.exceptions import ErrorCode, error_response
from common.context import current_request_id


def csrf_failure(request, reason=""):
    body = {
        "error": {
            "code": ErrorCode.AUTH_CSRF_FAILED,
            "message": "Validasi CSRF gagal. Muat ulang halaman.",
            "fields": {},
            "request_id": current_request_id(),
            "details": {},
        },
        "meta": {"request_id": current_request_id()},
    }
    return HttpResponse(json.dumps(body), status=403, content_type="application/json")


@extend_schema(tags=["system"], responses={200: dict})
@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def health_live(request):
    return Response({"status": "ok"})


@extend_schema(tags=["system"], responses={200: dict, 503: dict})
@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def health_ready(request):
    checks = {}
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        checks["database"] = "ok"
    except Exception:  # noqa: BLE001 - readiness must report, not raise
        checks["database"] = "unavailable"
    if not getattr(settings, "DEV_SYNC_TASKS", False):
        try:
            import redis

            redis.Redis.from_url(settings.CELERY_BROKER_URL, socket_connect_timeout=1).ping()
            checks["broker"] = "ok"
        except Exception:  # noqa: BLE001
            checks["broker"] = "unavailable"
    else:
        checks["broker"] = "skipped (DEV_SYNC_TASKS)"
    if any(value == "unavailable" for value in checks.values()):
        return error_response(ErrorCode.DEPENDENCY_UNAVAILABLE, "Dependensi belum siap.", 503, details={"checks": checks})
    return Response({"status": "ready", "checks": checks})

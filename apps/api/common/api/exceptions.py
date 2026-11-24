"""Stable error envelope and codes (PRD §11.2, §46.3, §48)."""

import logging

from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import Http404
from rest_framework import exceptions as drf
from rest_framework import status
from rest_framework.response import Response

from common.api.renderers import Enveloped
from common.context import current_request_id

logger = logging.getLogger(__name__)


class ErrorCode:
    """Canonical catalog (PRD §48) plus the transport-level codes listed in docs/api/error-codes.md."""

    # PRD §48
    AUTH_INVALID_CREDENTIALS = "AUTH_INVALID_CREDENTIALS"
    AUTH_ACCOUNT_INACTIVE = "AUTH_ACCOUNT_INACTIVE"
    AUTH_CSRF_FAILED = "AUTH_CSRF_FAILED"
    AUTH_RATE_LIMITED = "AUTH_RATE_LIMITED"
    PERMISSION_DENIED = "PERMISSION_DENIED"
    OBJECT_SCOPE_DENIED = "OBJECT_SCOPE_DENIED"
    RESOURCE_NOT_FOUND = "RESOURCE_NOT_FOUND"
    VALIDATION_ERROR = "VALIDATION_ERROR"
    ACADEMIC_YEAR_INVALID_RANGE = "ACADEMIC_YEAR_INVALID_RANGE"
    TRIMESTER_INVALID_RANGE = "TRIMESTER_INVALID_RANGE"
    TRIMESTER_COUNT_INVALID = "TRIMESTER_COUNT_INVALID"
    CAU_TRIMESTER_MISMATCH = "CAU_TRIMESTER_MISMATCH"
    ENROLLMENT_DUPLICATE_ACTIVE = "ENROLLMENT_DUPLICATE_ACTIVE"
    ENROLLMENT_CLASS_MISMATCH = "ENROLLMENT_CLASS_MISMATCH"
    MAJOR_CHANGE_REASON_REQUIRED = "MAJOR_CHANGE_REASON_REQUIRED"
    SCHEDULE_TEACHER_CONFLICT = "SCHEDULE_TEACHER_CONFLICT"
    SCHEDULE_CLASS_CONFLICT = "SCHEDULE_CLASS_CONFLICT"
    SCHEDULE_ROOM_CONFLICT = "SCHEDULE_ROOM_CONFLICT"
    SCHEDULE_ASSIGNMENT_MISMATCH = "SCHEDULE_ASSIGNMENT_MISMATCH"  # PRD §19.2
    SCHEDULE_DATE_OUTSIDE_YEAR = "SCHEDULE_DATE_OUTSIDE_YEAR"  # PRD §19.2
    ATTENDANCE_STUDENT_NOT_ENROLLED = "ATTENDANCE_STUDENT_NOT_ENROLLED"
    ATTENDANCE_SESSION_LOCKED = "ATTENDANCE_SESSION_LOCKED"
    ATTENDANCE_VERSION_CONFLICT = "ATTENDANCE_VERSION_CONFLICT"
    OFFLINE_MUTATION_REPLAY_MISMATCH = "OFFLINE_MUTATION_REPLAY_MISMATCH"
    ASSESSMENT_SCORE_OUT_OF_RANGE = "ASSESSMENT_SCORE_OUT_OF_RANGE"
    ASSESSMENT_LOCKED = "ASSESSMENT_LOCKED"
    GRADING_WEIGHT_INVALID = "GRADING_WEIGHT_INVALID"
    TERM_GRADE_FINALIZED = "TERM_GRADE_FINALIZED"
    TERM_GRADE_REOPEN_REASON_REQUIRED = "TERM_GRADE_REOPEN_REASON_REQUIRED"
    REPORT_NOT_READY = "REPORT_NOT_READY"
    REPORT_ALREADY_PUBLISHED = "REPORT_ALREADY_PUBLISHED"
    PROMOTION_INVALID_STATE = "PROMOTION_INVALID_STATE"
    INVOICE_DUPLICATE_GENERATION = "INVOICE_DUPLICATE_GENERATION"
    INVOICE_ALREADY_SETTLED = "INVOICE_ALREADY_SETTLED"
    INVOICE_VOID_NOT_ALLOWED = "INVOICE_VOID_NOT_ALLOWED"
    PAYMENT_AMOUNT_INVALID = "PAYMENT_AMOUNT_INVALID"
    PAYMENT_OVERALLOCATION = "PAYMENT_OVERALLOCATION"
    PAYMENT_IDEMPOTENCY_CONFLICT = "PAYMENT_IDEMPOTENCY_CONFLICT"
    PAYMENT_ALREADY_REVERSED = "PAYMENT_ALREADY_REVERSED"
    FILE_TYPE_NOT_ALLOWED = "FILE_TYPE_NOT_ALLOWED"
    FILE_TOO_LARGE = "FILE_TOO_LARGE"
    FILE_NOT_AUTHORIZED = "FILE_NOT_AUTHORIZED"
    IMPORT_TEMPLATE_INVALID = "IMPORT_TEMPLATE_INVALID"
    IMPORT_HAS_ERRORS = "IMPORT_HAS_ERRORS"
    IMPORT_ALREADY_CONFIRMED = "IMPORT_ALREADY_CONFIRMED"
    EXTRACURRICULAR_CAPACITY_FULL = "EXTRACURRICULAR_CAPACITY_FULL"
    COUNSELING_CASE_CLOSED = "COUNSELING_CASE_CLOSED"
    FEATURE_DISABLED = "FEATURE_DISABLED"
    LIBRARY_COPY_UNAVAILABLE = "LIBRARY_COPY_UNAVAILABLE"
    LIBRARY_LOAN_ALREADY_CLOSED = "LIBRARY_LOAN_ALREADY_CLOSED"
    ASSET_NOT_AVAILABLE = "ASSET_NOT_AVAILABLE"
    LIBRARY_BORROWER_INACTIVE = "LIBRARY_BORROWER_INACTIVE"
    LIBRARY_RENEWAL_LIMIT = "LIBRARY_RENEWAL_LIMIT"
    JOB_ALREADY_RUNNING = "JOB_ALREADY_RUNNING"
    JOB_FAILED = "JOB_FAILED"
    DEPENDENCY_UNAVAILABLE = "DEPENDENCY_UNAVAILABLE"
    # Transport-level extensions (docs/api/error-codes.md)
    AUTH_NOT_AUTHENTICATED = "AUTH_NOT_AUTHENTICATED"
    AUTH_RESET_TOKEN_INVALID = "AUTH_RESET_TOKEN_INVALID"
    INVALID_STATE_TRANSITION = "INVALID_STATE_TRANSITION"
    RESOURCE_IN_USE = "RESOURCE_IN_USE"
    ACADEMIC_YEAR_NOT_READY = "ACADEMIC_YEAR_NOT_READY"
    IDEMPOTENCY_KEY_REQUIRED = "IDEMPOTENCY_KEY_REQUIRED"
    IDEMPOTENCY_CONFLICT = "IDEMPOTENCY_CONFLICT"
    METHOD_NOT_ALLOWED = "METHOD_NOT_ALLOWED"
    UNSUPPORTED_MEDIA_TYPE = "UNSUPPORTED_MEDIA_TYPE"
    INTERNAL_ERROR = "INTERNAL_ERROR"


class DomainError(drf.APIException):
    """Business-rule violation raised from the service layer with a stable code."""

    status_code = status.HTTP_400_BAD_REQUEST

    def __init__(self, code, message, *, status_code=None, fields=None, details=None):
        super().__init__(detail=message)
        self.error_code = code
        self.message = message
        if status_code is not None:
            self.status_code = status_code
        self.fields = fields or {}
        self.details = details or {}


class ConflictError(DomainError):
    status_code = status.HTTP_409_CONFLICT


class ScopeDenied(DomainError):
    """Object exists but is outside the actor's scope. Reported as 404 to avoid existence leaks."""

    def __init__(self, message="Data tidak ditemukan."):
        super().__init__(ErrorCode.RESOURCE_NOT_FOUND, message, status_code=status.HTTP_404_NOT_FOUND)


def _flatten(detail, prefix=""):
    out = {}
    if isinstance(detail, dict):
        for key, value in detail.items():
            name = f"{prefix}.{key}" if prefix else str(key)
            out.update(_flatten(value, name))
    elif isinstance(detail, list):
        if all(not isinstance(item, (dict, list)) for item in detail):
            out[prefix or "non_field_errors"] = [str(item) for item in detail]
        else:
            for idx, item in enumerate(detail):
                out.update(_flatten(item, f"{prefix}[{idx}]" if prefix else f"[{idx}]"))
    else:
        out[prefix or "non_field_errors"] = [str(detail)]
    return out


def error_response(code, message, status_code, *, fields=None, details=None, headers=None):
    payload = Enveloped(
        {
            "error": {
                "code": code,
                "message": message,
                "fields": fields or {},
                "request_id": current_request_id(),
                "details": details or {},
            }
        }
    )
    return Response(payload, status=status_code, headers=headers)


def exception_handler(exc, context):
    if isinstance(exc, Http404):
        exc = drf.NotFound()
    elif isinstance(exc, DjangoPermissionDenied):
        exc = drf.PermissionDenied()
    elif isinstance(exc, DjangoValidationError):
        exc = drf.ValidationError(getattr(exc, "message_dict", None) or exc.messages)

    headers = {}
    if isinstance(exc, DomainError):
        return error_response(exc.error_code, exc.message, exc.status_code, fields=exc.fields, details=exc.details)
    if isinstance(exc, drf.ValidationError):
        return error_response(ErrorCode.VALIDATION_ERROR, "Data tidak valid.", 400, fields=_flatten(exc.detail))
    if isinstance(exc, (drf.NotAuthenticated, drf.AuthenticationFailed)):
        if getattr(exc, "auth_header", None):
            headers["WWW-Authenticate"] = exc.auth_header
        return error_response(ErrorCode.AUTH_NOT_AUTHENTICATED, "Silakan login terlebih dahulu.", 401, headers=headers)
    if isinstance(exc, drf.PermissionDenied):
        if str(exc.detail).startswith("CSRF Failed"):
            return error_response(ErrorCode.AUTH_CSRF_FAILED, "Validasi CSRF gagal. Muat ulang halaman.", 403)
        return error_response(ErrorCode.PERMISSION_DENIED, "Anda tidak memiliki izin untuk tindakan ini.", 403)
    if isinstance(exc, drf.NotFound):
        return error_response(ErrorCode.RESOURCE_NOT_FOUND, "Data tidak ditemukan.", 404)
    if isinstance(exc, drf.Throttled):
        if exc.wait:
            headers["Retry-After"] = str(int(exc.wait))
        return error_response(
            ErrorCode.AUTH_RATE_LIMITED,
            "Terlalu banyak percobaan. Coba lagi nanti.",
            429,
            details={"retry_after_seconds": int(exc.wait or 0)},
            headers=headers,
        )
    if isinstance(exc, drf.MethodNotAllowed):
        return error_response(ErrorCode.METHOD_NOT_ALLOWED, "Metode tidak diizinkan.", 405)
    if isinstance(exc, drf.UnsupportedMediaType):
        return error_response(ErrorCode.UNSUPPORTED_MEDIA_TYPE, "Format permintaan tidak didukung.", 415)
    if isinstance(exc, drf.ParseError):
        return error_response(ErrorCode.VALIDATION_ERROR, "Permintaan tidak dapat dibaca.", 400)
    if isinstance(exc, drf.APIException):
        return error_response(str(exc.default_code).upper(), str(exc.detail), exc.status_code)

    logger.exception("Unhandled API exception")
    return error_response(ErrorCode.INTERNAL_ERROR, "Terjadi kesalahan pada server.", 500)

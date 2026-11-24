"""Cross-module guard: a term grade inside a PUBLISHED report card cannot be reopened (INV-11)."""

from common.api.exceptions import ConflictError, ErrorCode


def assert_no_published_report(term_grade):
    from .models import ReportCardSubject

    published = ReportCardSubject.objects.filter(term_grade=term_grade, report_card__status="PUBLISHED").exists()
    if published:
        raise ConflictError(
            ErrorCode.REPORT_ALREADY_PUBLISHED, "Rapor yang memuat nilai ini sudah terbit; buka kembali rapor terlebih dahulu."
        )

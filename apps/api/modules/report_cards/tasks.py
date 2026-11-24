"""Background PDF rendering (PRD §37: reports queue; idempotent per report revision)."""

from celery import shared_task
from django.conf import settings
from django.db import transaction

from modules.documents import services as files


@shared_task(bind=True, autoretry_for=(OSError,), retry_backoff=True, max_retries=3)
def render_report_pdf(self, report_id):
    from .models import ReportCard
    from .pdf import render

    with transaction.atomic():
        report = ReportCard.objects.select_for_update().filter(pk=report_id).first()
        if report is None or report.status != ReportCard.Status.PUBLISHED or report.pdf_file_id:
            return "skipped"  # idempotent: already rendered or no longer published
        verify = f"{settings.WEB_APP_URL.rstrip('/')}/verify/report/{report.verification_token}"
        data = render(report, verify_url=verify)
        doc = files.save_generated(
            document_type="REPORT_CARD",
            resource=report,
            data=data,
            filename=f"rapor_{report.snapshot.get('student_no')}_T{report.snapshot.get('trimester')}_r{report.revision_no}.pdf",
            mime_type=files.PDF,
        )
        report.pdf_file = doc.file
        report.save(update_fields=["pdf_file", "updated_at"])
    return "rendered"

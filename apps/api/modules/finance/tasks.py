"""Receipt PDF rendering after commit (PRD §25.4: no PDF work inside the payment transaction)."""

from celery import shared_task
from django.db import transaction

from modules.documents import services as files


@shared_task(bind=True, autoretry_for=(OSError,), retry_backoff=True, max_retries=3)
def render_receipt_pdf(self, receipt_id):
    from .models import Receipt
    from .pdf import render_receipt

    with transaction.atomic():
        r = Receipt.objects.select_for_update().filter(pk=receipt_id).first()
        if r is None or r.pdf_file_id:
            return "skipped"
        doc = files.save_generated(
            document_type="RECEIPT", resource=r, data=render_receipt(r), filename=f"kuitansi_{r.receipt_no}.pdf", mime_type=files.PDF
        )
        r.pdf_file = doc.file
        r.save(update_fields=["pdf_file", "updated_at"])
    return "rendered"


@shared_task(bind=True, acks_late=True)
def generate_invoices_task(self, year_id, period, fee_code, actor_id):
    """Idempotent by generation_key: retries/duplicates never create a second invoice (F9-06)."""
    from django.contrib.auth import get_user_model

    from modules.academics.models import AcademicYear

    from .services import generate_invoices

    actor = get_user_model().objects.filter(pk=actor_id).first()
    return generate_invoices(actor=actor, year=AcademicYear.objects.get(pk=year_id), period=period, fee_code=fee_code)

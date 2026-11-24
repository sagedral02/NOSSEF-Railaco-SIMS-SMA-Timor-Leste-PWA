"""Report jobs (PRD §32.3): queue → render CSV (UTF-8 BOM) / XLSX (stable columns) / PDF (tabular) → private file.
PII exports are audit logged; generated files expire after REPORT_RETENTION_DAYS (F13-11)."""

import csv
import io
from datetime import date, datetime, timedelta
from decimal import Decimal

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from common.api.exceptions import DomainError, ErrorCode
from modules.audit import services as audit
from modules.audit.events import AuditEvent
from modules.documents import services as files
from modules.integrations.framework import build_xlsx

from .catalog import REPORTS, allowed
from .models import ReportJob

RETENTION_DAYS = getattr(settings, "REPORT_RETENTION_DAYS", 7)


def _cell(v):
    if v is None:
        return ""
    if isinstance(v, datetime):
        return timezone.localtime(v).strftime("%Y-%m-%d %H:%M") if timezone.is_aware(v) else v.strftime("%Y-%m-%d %H:%M")
    if isinstance(v, date):
        return v.isoformat()
    if isinstance(v, bool):
        return "Ya" if v else "Tidak"
    if isinstance(v, Decimal):
        return str(v)
    return v if isinstance(v, (int, float)) else str(v)


def render(fmt, title, headers, rows):
    rows = [[_cell(c) for c in r] for r in rows]
    if fmt == "CSV":
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(headers)
        w.writerows(rows)
        return ("﻿" + buf.getvalue()).encode("utf-8"), files.CSV, "csv"
    if fmt == "XLSX":
        return build_xlsx(title, headers, rows, {"report": title, "generated_at": timezone.now().isoformat()}), files.XLSX, "xlsx"
    return _pdf(title, headers, rows), files.PDF, "pdf"


def _pdf(title, headers, rows):
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    from modules.school.services import get_profile

    buf = io.BytesIO()
    size = landscape(A4) if len(headers) > 6 else A4
    doc = SimpleDocTemplate(
        buf, pagesize=size, leftMargin=12 * mm, rightMargin=12 * mm, topMargin=12 * mm, bottomMargin=12 * mm, title=title, invariant=1
    )
    styles = getSampleStyleSheet()
    small = styles["BodyText"].clone("small", fontSize=7.5, leading=9)
    data = [[Paragraph(f"<b>{h}</b>", small) for h in headers]] + [[Paragraph(str(c), small) for c in r] for r in rows[:5000]]
    table = Table(data, repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#E6E4E0")),
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F4F2EE")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    story = [
        Paragraph(f"<b>{get_profile().name}</b> — {title}", styles["Heading4"]),
        Paragraph(timezone.localtime().strftime("%Y-%m-%d %H:%M"), small),
        Spacer(1, 4 * mm),
        table,
    ]
    doc.build(story)
    return buf.getvalue()


def create_job(*, actor, report_type, parameters, fmt):
    rep = REPORTS.get(report_type)
    if rep is None:
        raise DomainError(ErrorCode.VALIDATION_ERROR, "Data tidak valid.", fields={"report_type": ["Laporan tidak dikenal."]})
    if not allowed(actor, rep):
        raise DomainError(ErrorCode.PERMISSION_DENIED, "Anda tidak memiliki izin untuk laporan ini.", status_code=403)
    if fmt not in rep.formats:
        raise DomainError(ErrorCode.VALIDATION_ERROR, "Data tidak valid.", fields={"format": ["Format tidak didukung."]})
    params = {k: v for k, v in (parameters or {}).items() if k in rep.params}
    job = ReportJob.objects.create(requested_by=actor, report_type=report_type, parameters=params, format=fmt)
    from .tasks import run_report_job

    jid = str(job.pk)
    transaction.on_commit(lambda: run_report_job.delay(jid))
    return job


def execute(job_id):
    with transaction.atomic():
        job = ReportJob.objects.select_for_update().filter(pk=job_id).first()
        if job is None or job.status != ReportJob.Status.QUEUED:
            return
        job.status, job.progress_percent = ReportJob.Status.RUNNING, 10
        job.save(update_fields=["status", "progress_percent", "updated_at"])
    rep = REPORTS[job.report_type]
    try:
        if not allowed(job.requested_by, rep):  # permission re-checked at run time (role may have been revoked)
            raise DomainError(ErrorCode.PERMISSION_DENIED, "Izin dicabut.", status_code=403)
        headers, rows = rep.build(job.requested_by, job.parameters)
        data, mime, ext = render(job.format, f"{rep.code} {rep.title}", headers, rows)
        stamp = timezone.localtime().strftime("%Y%m%d-%H%M")
        stored = files.store_bytes(
            data,
            original_name=f"{rep.code}_{stamp}.{ext}",
            purpose="GENERATED",
            uploaded_by=job.requested_by,
            attached=True,
            mime_type=mime,
        )
        job.result_file, job.row_count, job.status, job.progress_percent = stored, len(rows), ReportJob.Status.SUCCEEDED, 100
        if rep.pii:
            audit.record(
                AuditEvent.EXPORT_GENERATED,
                actor=job.requested_by,
                resource=job,
                metadata={"report": rep.code, "rows": len(rows), "format": job.format},
            )
    except DomainError as exc:
        job.status, job.error_code = ReportJob.Status.FAILED, exc.error_code
    except Exception:  # noqa: BLE001 - job records a safe code; details go to logs
        import logging

        logging.getLogger(__name__).exception("Report job failed", extra={"job": str(job.pk)})
        job.status, job.error_code = ReportJob.Status.FAILED, ErrorCode.INTERNAL_ERROR
    job.finished_at = timezone.now()
    job.save()


def expire_old(days=None):
    """Retention (F13-11): delete generated export files past retention; jobs become EXPIRED (history kept)."""
    from django.core.files.storage import default_storage

    cutoff = timezone.now() - timedelta(days=days or RETENTION_DAYS)
    n = 0
    for job in ReportJob.objects.filter(status=ReportJob.Status.SUCCEEDED, finished_at__lt=cutoff).select_related("result_file"):
        f = job.result_file
        job.status, job.result_file = ReportJob.Status.EXPIRED, None
        job.save(update_fields=["status", "result_file", "updated_at"])
        if f is not None:
            default_storage.delete(f.object_key)
            f.delete()
        n += 1
    return n

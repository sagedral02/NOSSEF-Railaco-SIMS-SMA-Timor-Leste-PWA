"""Import job lifecycle (PRD §32.2, §66 ImportJob). Idempotent by key; same-file retries detected by checksum."""

import csv
import io

from django.db import transaction
from django.utils import timezone

from common.api.exceptions import ConflictError, DomainError, ErrorCode
from modules.audit import services as audit
from modules.audit.events import AuditEvent
from modules.documents import services as files

from .framework import REGISTRY, read_table
from .models import ImportJob, ImportRowError

S = ImportJob.Status


def importer_for(import_type):
    imp = REGISTRY.get(import_type)
    if imp is None:
        raise DomainError(ErrorCode.VALIDATION_ERROR, "Data tidak valid.", fields={"import_type": ["Jenis impor tidak dikenal."]})
    return imp


@transaction.atomic
def create_job(*, actor, import_type, upload, params, idempotency_key):
    existing = ImportJob.objects.filter(idempotency_key=idempotency_key).first()
    if existing:
        if existing.requested_by_id != actor.pk or existing.import_type != import_type:
            raise ConflictError(ErrorCode.IDEMPOTENCY_CONFLICT, "Kunci idempotensi sudah dipakai untuk permintaan lain.")
        return existing, False
    imp = importer_for(import_type)
    params = imp.validate_params(params or {})
    imp.check_permission(actor, params)
    stored = files.store_upload(upload, purpose="IMPORT", uploaded_by=actor)
    files.attach(stored)
    job = ImportJob.objects.create(
        import_type=import_type,
        source_file=stored,
        requested_by=actor,
        params=params,
        checksum=stored.sha256,
        idempotency_key=idempotency_key,
    )
    duplicate_of = (
        ImportJob.objects.filter(
            import_type=import_type, checksum=stored.sha256, requested_by=actor, status__in=[S.COMPLETED, S.COMPLETED_WITH_ERRORS]
        )
        .exclude(pk=job.pk)
        .first()
    )
    validate(job)
    if duplicate_of:
        job.result = {**job.result, "same_file_as": str(duplicate_of.pk)}  # warn the user about an accidental re-upload
        job.save(update_fields=["result"])
    return job, True


def validate(job):
    imp = importer_for(job.import_type)
    job.status = S.VALIDATING
    job.save(update_fields=["status", "updated_at"])
    table = read_table(files.read_bytes(job.source_file), job.source_file.mime_type)
    parsed = imp.parse(table, job.params)
    job.row_errors.all().delete()
    if parsed.header_error:
        ImportRowError.objects.create(
            import_job=job, row_number=1, error_code=ErrorCode.IMPORT_TEMPLATE_INVALID, message=parsed.header_error
        )
        job.status, job.error_code = S.INVALID, ErrorCode.IMPORT_TEMPLATE_INVALID
        job.total_rows = job.valid_rows = 0
        job.invalid_rows = 1
        job.preview = []
        job.save()
        return job
    bad_rows = {e["row"] for e in parsed.errors}
    ImportRowError.objects.bulk_create(
        [
            ImportRowError(
                import_job=job,
                row_number=e["row"],
                field_name=e.get("field", ""),
                error_code=e["code"],
                message=e["message"],
                raw_value=str(e.get("raw", ""))[:200],
            )
            for e in parsed.errors
        ]
    )
    job.total_rows = len(parsed.rows) + len(bad_rows - {r["row"] for r in parsed.rows})
    job.invalid_rows = len(bad_rows)
    job.valid_rows = max(0, job.total_rows - job.invalid_rows)
    job.preview = parsed.rows
    job.status = S.READY if not parsed.errors and parsed.rows else S.INVALID
    job.error_code = "" if job.status == S.READY else (ErrorCode.IMPORT_HAS_ERRORS if parsed.errors else ErrorCode.IMPORT_TEMPLATE_INVALID)
    job.save()
    return job


@transaction.atomic
def confirm(*, actor, job):
    job = ImportJob.objects.select_for_update().get(pk=job.pk)
    if job.requested_by_id != actor.pk:
        raise DomainError(ErrorCode.PERMISSION_DENIED, "Hanya pengunggah yang dapat mengonfirmasi impor ini.", status_code=403)
    if job.status in {S.QUEUED, S.PROCESSING, S.COMPLETED, S.COMPLETED_WITH_ERRORS}:
        raise ConflictError(ErrorCode.IMPORT_ALREADY_CONFIRMED, "Impor sudah dikonfirmasi.")
    if job.status != S.READY:
        raise ConflictError(ErrorCode.IMPORT_HAS_ERRORS, "Perbaiki error pada pratinjau sebelum konfirmasi.")
    importer_for(job.import_type).check_permission(actor, job.params)
    job.status = S.QUEUED
    job.save(update_fields=["status", "updated_at"])
    from .tasks import run_import

    jid = str(job.pk)
    transaction.on_commit(lambda: run_import.delay(jid))
    audit.record(AuditEvent.IMPORT_CONFIRMED, actor=actor, resource=job, metadata={"type": job.import_type, "rows": job.valid_rows})
    return job


def execute(job_id):
    """Apply a confirmed job (worker). Idempotent: only QUEUED jobs are processed."""
    with transaction.atomic():
        job = ImportJob.objects.select_for_update().filter(pk=job_id).first()
        if job is None or job.status != S.QUEUED:
            return
        job.status = S.PROCESSING
        job.save(update_fields=["status", "updated_at"])
    try:
        result = importer_for(job.import_type).apply(job, job.preview, job.requested_by)
    except DomainError as exc:
        job.status, job.error_code, job.finished_at = S.FAILED, exc.error_code, timezone.now()
        job.result = {"message": exc.message, **exc.details}
        job.save()
        return
    outcomes = result.pop("rows", [])
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["row", "outcome", "message"])
    for r in outcomes:
        w.writerow([r.get("row"), r.get("outcome"), r.get("message", "")])
    data = ("﻿" + buf.getvalue()).encode("utf-8")
    stored = files.store_bytes(
        data,
        original_name=f"hasil_import_{job.import_type.lower()}.csv",
        purpose="GENERATED",
        uploaded_by=job.requested_by,
        attached=True,
        mime_type=files.CSV,
    )
    job.result_file = stored
    job.result = result
    job.status = S.COMPLETED_WITH_ERRORS if result.get("errors") else S.COMPLETED
    job.finished_at = timezone.now()
    job.save()

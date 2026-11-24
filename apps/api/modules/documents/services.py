"""Private storage service (PRD §31). Content-signature MIME check, size limits, random object keys, sha256.

Files are always streamed through an authorized endpoint; nothing under the storage root is publicly served.
"""

import hashlib
import mimetypes
import os
import re
import uuid

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.db import transaction
from django.utils import timezone

from common.api.exceptions import DomainError, ErrorCode

from .models import Classification, GeneratedDocument, StoredFile

PDF, JPEG, PNG, XLSX, CSV = (
    "application/pdf",
    "image/jpeg",
    "image/png",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/csv",
)

# purpose -> (allowed mime types, max bytes, classification)
PURPOSES = {
    "ADMISSION_DOCUMENT": ({PDF, JPEG, PNG}, 5 * 1024 * 1024, Classification.CONFIDENTIAL),
    "STUDENT_DOCUMENT": ({PDF, JPEG, PNG}, 5 * 1024 * 1024, Classification.CONFIDENTIAL),
    "STUDENT_PHOTO": ({JPEG, PNG}, 2 * 1024 * 1024, Classification.CONFIDENTIAL),
    "TRANSFER_DOCUMENT": ({PDF, JPEG, PNG}, 5 * 1024 * 1024, Classification.CONFIDENTIAL),
    "LEAVE_EVIDENCE": ({PDF, JPEG, PNG}, 5 * 1024 * 1024, Classification.CONFIDENTIAL),
    "PAYMENT_PROOF": ({PDF, JPEG, PNG}, 5 * 1024 * 1024, Classification.CONFIDENTIAL),
    "COUNSELING_EVIDENCE": ({PDF, JPEG, PNG}, 5 * 1024 * 1024, Classification.RESTRICTED),
    "ANNOUNCEMENT_ATTACHMENT": ({PDF, JPEG, PNG}, 10 * 1024 * 1024, Classification.INTERNAL),
    "LIBRARY_ATTACHMENT": ({PDF, JPEG, PNG}, 5 * 1024 * 1024, Classification.INTERNAL),
    "ASSET_ATTACHMENT": ({PDF, JPEG, PNG}, 5 * 1024 * 1024, Classification.INTERNAL),
    "IMPORT": ({XLSX, CSV}, 15 * 1024 * 1024, Classification.CONFIDENTIAL),
    "SCHOOL_LOGO": ({JPEG, PNG}, 1024 * 1024, Classification.PUBLIC),
    # Server-generated artifacts (report cards, receipts, exports); never accepted from uploads.
    "GENERATED": ({PDF, XLSX, CSV}, 50 * 1024 * 1024, Classification.CONFIDENTIAL),
}
UPLOADABLE = {k for k in PURPOSES if k != "GENERATED"}


def sniff(head: bytes, name: str) -> str | None:
    """Detect type from content signature, not extension (PRD §31.1)."""
    if head.startswith(b"%PDF-"):
        return PDF
    if head.startswith(b"\xff\xd8\xff"):
        return JPEG
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return PNG
    if head.startswith(b"PK\x03\x04") and name.lower().endswith(".xlsx"):
        return XLSX
    if name.lower().endswith(".csv"):
        try:
            head.decode("utf-8-sig")
        except UnicodeDecodeError:
            return None
        if b"\x00" not in head:
            return CSV
    return None


def sanitize_name(name: str) -> str:
    base = os.path.basename(name or "file").strip().replace("\x00", "")
    base = re.sub(r"[^\w.\- ()]+", "_", base, flags=re.UNICODE)[:200]
    return base or "file"


@transaction.atomic
def store_bytes(data: bytes, *, original_name: str, purpose: str, uploaded_by=None, attached=False, mime_type=None):
    if purpose not in PURPOSES:
        raise DomainError(ErrorCode.VALIDATION_ERROR, "Data tidak valid.", fields={"purpose": ["Tujuan unggahan tidak dikenal."]})
    allowed, max_bytes, classification = PURPOSES[purpose]
    name = sanitize_name(original_name)
    detected = mime_type or sniff(data[:2048], name)
    if detected not in allowed:
        raise DomainError(
            ErrorCode.FILE_TYPE_NOT_ALLOWED, "Jenis file tidak diizinkan.", details={"allowed": sorted(allowed), "detected": detected}
        )
    if len(data) > max_bytes:
        raise DomainError(ErrorCode.FILE_TOO_LARGE, "Ukuran file terlalu besar.", details={"max_bytes": max_bytes, "size": len(data)})
    ext = mimetypes.guess_extension(detected) or ""
    key = f"{purpose.lower()}/{timezone.now():%Y/%m}/{uuid.uuid4().hex}{ext}"
    saved_key = default_storage.save(key, ContentFile(data))
    return StoredFile.objects.create(
        object_key=saved_key,
        original_name=name,
        mime_type=detected,
        size_bytes=len(data),
        sha256=hashlib.sha256(data).hexdigest(),
        classification=classification,
        purpose=purpose,
        uploaded_by=uploaded_by if getattr(uploaded_by, "is_authenticated", False) else None,
        attached=attached,
    )


def store_upload(upload, *, purpose, uploaded_by=None):
    if purpose not in UPLOADABLE:
        raise DomainError(ErrorCode.VALIDATION_ERROR, "Data tidak valid.", fields={"purpose": ["Tujuan unggahan tidak dikenal."]})
    max_bytes = PURPOSES.get(purpose, (None, settings.MAX_UPLOAD_BYTES, None))[1]
    if upload.size > max_bytes:
        raise DomainError(ErrorCode.FILE_TOO_LARGE, "Ukuran file terlalu besar.", details={"max_bytes": max_bytes, "size": upload.size})
    return store_bytes(upload.read(), original_name=upload.name, purpose=purpose, uploaded_by=uploaded_by)


def attach(file: StoredFile, *, expected_purposes=None, owner=None):
    """Mark a temporary upload as attached to a domain record; reject reuse and foreign uploads."""
    if expected_purposes and file.purpose not in expected_purposes:
        raise DomainError(ErrorCode.VALIDATION_ERROR, "Data tidak valid.", fields={"file": ["Jenis unggahan tidak sesuai."]})
    if owner is not None and file.uploaded_by_id and file.uploaded_by_id != getattr(owner, "pk", None):
        raise DomainError(ErrorCode.FILE_NOT_AUTHORIZED, "File ini milik pengguna lain.", status_code=403)
    if not file.attached:
        StoredFile.objects.filter(pk=file.pk).update(attached=True)
        file.attached = True
    return file


def open_file(file: StoredFile):
    return default_storage.open(file.object_key, "rb")


def read_bytes(file: StoredFile) -> bytes:
    with open_file(file) as fh:
        return fh.read()


@transaction.atomic
def save_generated(*, document_type, resource, data: bytes, filename: str, mime_type: str, generated_by=None):
    resource_type, resource_id = resource._meta.label_lower, str(resource.pk)
    last = (
        GeneratedDocument.objects.select_for_update()
        .filter(document_type=document_type, resource_type=resource_type, resource_id=resource_id)
        .order_by("-revision")
        .first()
    )
    stored = store_bytes(data, original_name=filename, purpose="GENERATED", uploaded_by=generated_by, attached=True, mime_type=mime_type)
    return GeneratedDocument.objects.create(
        document_type=document_type,
        resource_type=resource_type,
        resource_id=resource_id,
        revision=(last.revision + 1) if last else 1,
        file=stored,
        generated_by=generated_by if getattr(generated_by, "is_authenticated", False) else None,
    )

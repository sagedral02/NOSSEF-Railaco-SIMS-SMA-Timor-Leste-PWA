"""Admissions workflow (PRD §16, §66 Applicant/AdmissionPeriod transitions, F3)."""

import hashlib
import hmac
import secrets

from django.db import IntegrityError, transaction
from django.utils import timezone

from common.api.exceptions import ConflictError, DomainError, ErrorCode
from common.events import emit
from modules.audit import services as audit
from modules.audit.events import AuditEvent
from modules.documents import services as files
from modules.students import services as students
from modules.students.models import EnrollmentSource, Guardian

from .models import (
    DOCUMENT_TYPES,
    AdmissionDecision,
    AdmissionPeriod,
    Applicant,
    ApplicantDocument,
    ApplicantGuardian,
    ApplicantStatus,
)

S = ApplicantStatus
EDITABLE = ("full_name", "birth_place", "birth_date", "gender", "previous_school", "phone", "email", "address", "desired_major")
_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O/1/I to avoid transcription errors


def _hash(token):
    return hashlib.sha256(token.encode()).hexdigest()


def check_token(applicant, token):
    return bool(token) and bool(applicant.access_token_hash) and hmac.compare_digest(applicant.access_token_hash, _hash(token))


def _registration_no(period):
    suffix = "".join(secrets.choice(_ALPHABET) for _ in range(6))
    return f"PPDB-{period.academic_year.name}-{suffix}"


def _snap(a):
    return {f: str(getattr(a, f"{f}_id" if f == "desired_major" else f) or "") for f in EDITABLE} | {"status": a.status}


def _transition(applicant, allowed_from, target):
    if applicant.status not in allowed_from:
        raise ConflictError(ErrorCode.INVALID_STATE_TRANSITION, f"Pendaftar berstatus {applicant.status}; tidak dapat menjadi {target}.")


def _lock(applicant):
    return Applicant.objects.select_for_update(of=("self",)).select_related("admission_period__academic_year").get(pk=applicant.pk)


# ------------------------------------------------------------------ periods

_PERIOD_FLOW = {
    "open": ({AdmissionPeriod.Status.DRAFT, AdmissionPeriod.Status.CLOSED}, AdmissionPeriod.Status.OPEN),
    "close": ({AdmissionPeriod.Status.OPEN}, AdmissionPeriod.Status.CLOSED),
    "publish": ({AdmissionPeriod.Status.CLOSED}, AdmissionPeriod.Status.DECISION),
    "complete": ({AdmissionPeriod.Status.DECISION}, AdmissionPeriod.Status.COMPLETED),
}


@transaction.atomic
def period_transition(*, actor, period, action):
    period = AdmissionPeriod.objects.select_for_update(of=("self",)).select_related("academic_year").get(pk=period.pk)
    allowed, target = _PERIOD_FLOW[action]
    if period.status not in allowed:
        raise ConflictError(ErrorCode.INVALID_STATE_TRANSITION, f"Periode berstatus {period.status}.")
    if action == "open":
        if period.academic_year.status == "CLOSED":
            raise ConflictError(ErrorCode.INVALID_STATE_TRANSITION, "Tahun ajaran tujuan sudah ditutup.")
        unknown = [d for d in period.required_documents if d not in DOCUMENT_TYPES]
        if unknown:
            raise DomainError(ErrorCode.VALIDATION_ERROR, "Data tidak valid.", fields={"required_documents": [f"Tidak dikenal: {unknown}"]})
        if period.registration_end <= timezone.now():
            raise DomainError(
                ErrorCode.VALIDATION_ERROR, "Data tidak valid.", fields={"registration_end": ["Batas pendaftaran sudah lewat."]}
            )
    before = period.status
    period.status = target
    period.save(update_fields=["status", "updated_at"])
    audit.record("ADMISSION_PERIOD_CHANGED", actor=actor, resource=period, before={"status": before}, after={"status": target})
    if action == "publish":
        emit("admission.decision_published", period_id=str(period.pk))
    return period


def is_accepting(period, at=None):
    at = at or timezone.now()
    return period.status == AdmissionPeriod.Status.OPEN and period.registration_start <= at <= period.registration_end


# ------------------------------------------------------------------ applicants


@transaction.atomic
def create_applicant(*, actor, period, data, guardians=(), public=False):
    if public and not is_accepting(period):
        raise DomainError(ErrorCode.INVALID_STATE_TRANSITION, "Pendaftaran tidak sedang dibuka.", status_code=409)
    if not public and period.status in {AdmissionPeriod.Status.COMPLETED}:
        raise ConflictError(ErrorCode.INVALID_STATE_TRANSITION, "Periode pendaftaran sudah selesai.")
    if data.get("birth_date") and data["birth_date"] > timezone.localdate():
        raise DomainError(
            ErrorCode.VALIDATION_ERROR, "Data tidak valid.", fields={"birth_date": ["Tanggal lahir tidak boleh di masa depan."]}
        )
    token = secrets.token_urlsafe(24)
    for _ in range(5):
        try:
            with transaction.atomic():
                applicant = Applicant.objects.create(
                    admission_period=period,
                    registration_no=_registration_no(period),
                    access_token_hash=_hash(token),
                    created_by=actor if getattr(actor, "is_authenticated", False) else None,
                    **{k: v for k, v in data.items() if k in EDITABLE},
                )
            break
        except IntegrityError:
            continue
    else:  # pragma: no cover - astronomically unlikely
        raise ConflictError(ErrorCode.INTERNAL_ERROR, "Gagal membuat nomor registrasi.")
    _save_guardians(applicant, guardians)
    audit.record("APPLICANT_CREATED", actor=actor, resource=applicant, metadata={"public": public})
    return applicant, token


def _save_guardians(applicant, guardians):
    if guardians is None:
        return
    applicant.guardians.all().delete()
    primary_seen = False
    for g in guardians:
        is_primary = bool(g.get("is_primary")) and not primary_seen
        primary_seen = primary_seen or is_primary
        ApplicantGuardian.objects.create(applicant=applicant, **{**g, "is_primary": is_primary})
    if guardians and not primary_seen:
        first = applicant.guardians.order_by("created_at").first()
        first.is_primary = True
        first.save(update_fields=["is_primary"])


@transaction.atomic
def update_applicant(*, actor, applicant, data, guardians=None, public=False):
    applicant = _lock(applicant)
    if public and applicant.status != S.DRAFT:
        raise ConflictError(ErrorCode.INVALID_STATE_TRANSITION, "Data hanya dapat diubah sebelum dikirim.")
    if applicant.status in {S.ENROLLED, S.REJECTED}:
        raise ConflictError(ErrorCode.INVALID_STATE_TRANSITION, f"Pendaftar berstatus {applicant.status}.")
    before = _snap(applicant)
    for f in EDITABLE:
        if f in data:
            setattr(applicant, f, data[f])
    applicant.save()
    if guardians is not None:
        _save_guardians(applicant, guardians)
    b, a = audit.diff(before, _snap(applicant))
    if a and applicant.status != S.DRAFT:
        # PRD §16.2: identity edits after submission are restricted to officers and audited.
        audit.record("APPLICANT_UPDATED", actor=actor, resource=applicant, before=b, after=a)
    return applicant


@transaction.atomic
def add_document(*, actor, applicant, document_type, file, public=False):
    applicant = _lock(applicant)
    if document_type not in DOCUMENT_TYPES:
        raise DomainError(ErrorCode.VALIDATION_ERROR, "Data tidak valid.", fields={"document_type": ["Jenis dokumen tidak dikenal."]})
    current = ApplicantDocument.objects.filter(applicant=applicant, document_type=document_type, active=True).first()
    if applicant.status == S.DRAFT:
        pass
    elif applicant.status == S.SUBMITTED and (current is None or current.verification_status == ApplicantDocument.Verification.INVALID):
        pass  # replacing a rejected/missing document after submission is allowed
    elif not public and applicant.status not in {S.ENROLLED, S.REJECTED}:
        pass  # officers may attach documents while processing
    else:
        raise ConflictError(ErrorCode.INVALID_STATE_TRANSITION, "Dokumen tidak dapat diubah pada status ini.")
    files.attach(file, expected_purposes={"ADMISSION_DOCUMENT"})
    if current is not None:
        current.active = False
        current.save(update_fields=["active", "updated_at"])
    return ApplicantDocument.objects.create(applicant=applicant, document_type=document_type, file=file)


def missing_required(applicant, *, must_be_valid=False):
    docs = {d.document_type: d for d in applicant.documents.filter(active=True)}
    out = []
    for code in applicant.admission_period.required_documents:
        d = docs.get(code)
        if d is None or (must_be_valid and d.verification_status != ApplicantDocument.Verification.VALID):
            out.append(code)
    return out


@transaction.atomic
def submit(*, actor, applicant, public=False):
    applicant = _lock(applicant)
    _transition(applicant, {S.DRAFT}, S.SUBMITTED)
    if public and not is_accepting(applicant.admission_period):
        raise DomainError(ErrorCode.INVALID_STATE_TRANSITION, "Pendaftaran tidak sedang dibuka.", status_code=409)
    if not applicant.guardians.exists():
        raise DomainError(ErrorCode.VALIDATION_ERROR, "Data tidak valid.", fields={"guardians": ["Minimal satu data wali."]})
    missing = missing_required(applicant)
    if missing:
        raise DomainError(
            ErrorCode.VALIDATION_ERROR, "Dokumen wajib belum lengkap.", fields={"documents": missing}, details={"missing": missing}
        )
    applicant.status = S.SUBMITTED
    applicant.submitted_at = timezone.now()
    applicant.save(update_fields=["status", "submitted_at", "updated_at"])
    audit.record("APPLICANT_SUBMITTED", actor=actor, resource=applicant)
    emit("admission.applicant_submitted", applicant_id=str(applicant.pk))
    return applicant


@transaction.atomic
def verify_document(*, actor, document, status, note=""):
    if status == ApplicantDocument.Verification.INVALID and not note.strip():
        raise DomainError(ErrorCode.VALIDATION_ERROR, "Data tidak valid.", fields={"note": ["Alasan penolakan dokumen wajib diisi."]})
    document.verification_status = status
    document.note = note
    document.verified_by = actor
    document.verified_at = timezone.now()
    document.save(update_fields=["verification_status", "note", "verified_by", "verified_at", "updated_at"])
    audit.record(
        "APPLICANT_DOCUMENT_VERIFIED",
        actor=actor,
        resource=document.applicant,
        metadata={"document_type": document.document_type, "status": status},
    )
    return document


@transaction.atomic
def verify(*, actor, applicant, note=""):
    applicant = _lock(applicant)
    _transition(applicant, {S.SUBMITTED}, S.VERIFIED)
    missing = missing_required(applicant, must_be_valid=True)
    if missing:
        raise DomainError(
            ErrorCode.VALIDATION_ERROR,
            "Dokumen wajib belum terverifikasi VALID.",
            fields={"documents": missing},
            details={"missing": missing},
            status_code=409,
        )
    applicant.status = S.VERIFIED
    applicant.save(update_fields=["status", "updated_at"])
    audit.record(AuditEvent.APPLICANT_VERIFIED, actor=actor, resource=applicant, metadata={"note": note[:500]})
    emit("admission.applicant_verified", applicant_id=str(applicant.pk))
    return applicant


@transaction.atomic
def mark_eligible(*, actor, applicant, note=""):
    """Selection step: a verified applicant enters the ranking pool (score/rank are recorded with the decision)."""
    applicant = _lock(applicant)
    _transition(applicant, {S.VERIFIED}, S.ELIGIBLE)
    applicant.status = S.ELIGIBLE
    applicant.save(update_fields=["status", "updated_at"])
    audit.record("APPLICANT_ELIGIBLE", actor=actor, resource=applicant, metadata={"note": note[:500]})
    return applicant


@transaction.atomic
def decide(*, actor, applicant, decision, score=None, rank=None, note=""):
    applicant = _lock(applicant)
    _transition(applicant, {S.ELIGIBLE, S.WAITING_LIST, S.ACCEPTED, S.REJECTED}, decision)
    if decision == S.REJECTED and not note.strip():
        raise DomainError(ErrorCode.VALIDATION_ERROR, "Data tidak valid.", fields={"note": ["Catatan keputusan wajib untuk penolakan."]})
    before = applicant.status
    obj, _ = AdmissionDecision.objects.update_or_create(
        applicant=applicant,
        defaults={"decision": decision, "score": score, "rank": rank, "decided_by": actor, "decided_at": timezone.now(), "note": note},
    )
    applicant.status = decision
    applicant.save(update_fields=["status", "updated_at"])
    audit.record(
        AuditEvent.ADMISSION_DECISION_CHANGED,
        actor=actor,
        resource=applicant,
        before={"status": before},
        after={"decision": decision, "score": str(score) if score is not None else None, "rank": rank},
        metadata={"note": note[:500]},
    )
    return applicant


@transaction.atomic
def re_register(*, actor, applicant):
    applicant = _lock(applicant)
    _transition(applicant, {S.ACCEPTED}, S.RE_REGISTERED)
    applicant.status = S.RE_REGISTERED
    applicant.re_registered_at = timezone.now()
    applicant.save(update_fields=["status", "re_registered_at", "updated_at"])
    audit.record("APPLICANT_RE_REGISTERED", actor=actor, resource=applicant)
    return applicant


@transaction.atomic
def enroll(*, actor, applicant, classroom, start_date=None, guardian_links=None):
    """Atomic applicant → Student + Guardian + StudentGuardian + StudentEnrollment (PRD §16.2, F3-13).

    Replays return the already-created student; any failure rolls back everything.
    `guardian_links` maps ApplicantGuardian id → existing Guardian id; unmapped guardians are created new
    (never merged by name, F3-14).
    """
    applicant = _lock(applicant)
    if applicant.status == S.ENROLLED and applicant.student_id:
        return applicant.student, False
    _transition(applicant, {S.RE_REGISTERED}, S.ENROLLED)
    if classroom.academic_year_id != applicant.admission_period.academic_year_id:
        raise DomainError(ErrorCode.ENROLLMENT_CLASS_MISMATCH, "Rombel harus pada tahun ajaran periode pendaftaran.")
    data = {f: getattr(applicant, f) for f in ("full_name", "birth_place", "birth_date", "gender", "address", "phone", "email")}
    data["admission_date"] = start_date or timezone.localdate()
    student = students.create_student(actor=actor, data=data, classroom=classroom, start_date=start_date, source=EnrollmentSource.ADMISSION)
    mapping = {str(k): str(v) for k, v in (guardian_links or {}).items()}
    for ag in applicant.guardians.all():
        existing = None
        if str(ag.pk) in mapping:
            existing = Guardian.objects.filter(pk=mapping[str(ag.pk)], active=True).first()
            if existing is None:
                raise DomainError(
                    ErrorCode.VALIDATION_ERROR,
                    "Data tidak valid.",
                    fields={"guardian_links": [f"Wali {mapping[str(ag.pk)]} tidak ditemukan."]},
                )
        students.link_guardian(
            actor=actor,
            student=student,
            guardian=existing,
            guardian_data=None
            if existing
            else {"full_name": ag.full_name, "phone": ag.phone, "email": ag.email, "address": ag.address, "occupation": ag.occupation},
            relationship=ag.relationship,
            is_primary=ag.is_primary,
            financial_contact=ag.is_primary,
        )
    applicant.student = student
    applicant.status = S.ENROLLED
    applicant.save(update_fields=["student", "status", "updated_at"])
    audit.record(
        AuditEvent.APPLICANT_ENROLLED,
        actor=actor,
        resource=applicant,
        after={"student_id": str(student.pk), "student_no": student.student_no},
    )
    emit("admission.student_enrolled", applicant_id=str(applicant.pk), student_id=str(student.pk))
    return student, True


def public_status(*, registration_no, birth_date):
    """Minimal, non-enumerable lookup: exact registration number AND birth date (PRD §16.5)."""
    a = (
        Applicant.objects.select_related("admission_period", "decision")
        .filter(registration_no=registration_no.strip().upper(), birth_date=birth_date)
        .first()
    )
    if a is None:
        return None
    published = a.admission_period.status in {AdmissionPeriod.Status.DECISION, AdmissionPeriod.Status.COMPLETED}
    status = a.status
    if not published and status in {S.ACCEPTED, S.WAITING_LIST, S.REJECTED, S.ELIGIBLE}:
        status = S.VERIFIED  # decisions are not visible before publication
    return {
        "registration_no": a.registration_no,
        "full_name": a.full_name,
        "status": status,
        "period": a.admission_period.name,
        "decision_published": published,
        "submitted_at": a.submitted_at,
        "missing_documents": missing_required(a) if a.status == S.DRAFT else [],
        "invalid_documents": list(a.documents.filter(active=True, verification_status="INVALID").values("document_type", "note")),
    }


def recover_registration_no(*, full_name, birth_date, guardian_phone):
    digits = "".join(ch for ch in guardian_phone if ch.isdigit())[-8:]
    if len(digits) < 6:
        return None
    matches = [
        a
        for a in Applicant.objects.filter(full_name__iexact=full_name.strip(), birth_date=birth_date).prefetch_related("guardians")
        if any("".join(ch for ch in g.phone if ch.isdigit()).endswith(digits) for g in a.guardians.all())
    ]
    return matches[0].registration_no if len(matches) == 1 else None

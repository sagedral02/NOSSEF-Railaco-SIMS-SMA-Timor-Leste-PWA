"""Counseling/discipline use cases (PRD §26). Every read of case detail is audited; closed cases are immutable until
reopened with `counseling.reopen` + reason; incidents are voided, never deleted."""

from django.db import transaction
from django.db.models import F, Q
from django.utils import timezone

from common.api.exceptions import ConflictError, DomainError, ErrorCode, ScopeDenied
from common.events import emit
from common.models import next_number
from common.permissions import user_has_global, user_has_perm
from modules.academics.selectors import homeroom_classroom_ids
from modules.audit import services as audit
from modules.audit.events import AuditEvent
from modules.documents import services as files
from modules.students.models import EnrollmentStatus
from modules.students.selectors import students_visible_to

from .models import CounselingCase, CounselingFollowUp, DisciplineIncident, GuardianContact

C = CounselingCase.Status
TRANSITIONS = {C.OPEN: {C.IN_PROGRESS, C.RESOLVED, C.CLOSED}, C.IN_PROGRESS: {C.RESOLVED, C.CLOSED}, C.RESOLVED: {C.CLOSED, C.IN_PROGRESS}}


# ------------------------------------------------------------------ scope


def cases_visible_to(user):
    """Counselors (global counseling.view) see all; nobody else reads cases (teachers/homeroom/portal never)."""
    if user_has_global(user, "counseling.view"):
        return CounselingCase.objects.all()
    return CounselingCase.objects.none()


def incidents_visible_to(user):
    qs = DisciplineIncident.objects.all()
    if user_has_global(user, "discipline.view"):
        return qs
    cond = Q(reported_by=user)  # teachers read their own reports
    if user_has_perm(user, "discipline.view"):
        cond |= Q(student__enrollments__classroom_id__in=homeroom_classroom_ids(user), student__enrollments__status=EnrollmentStatus.ACTIVE)
    return qs.filter(cond).distinct()


def can_write_cases(user):
    return user_has_global(user, "counseling.manage")


# ------------------------------------------------------------------ counseling


@transaction.atomic
def open_case(*, actor, student, category, severity, summary, details="", assigned_counselor=None):
    if not can_write_cases(actor):
        raise DomainError(ErrorCode.PERMISSION_DENIED, "Kasus konseling hanya dibuat oleh Guru BK.", status_code=403)
    now = timezone.now()
    case = CounselingCase.objects.create(
        student=student,
        case_no=f"BK-{now.year}-{next_number(f'BK:{now.year}'):05d}",
        category=category,
        severity=severity,
        summary=summary,
        details=details,
        assigned_counselor=assigned_counselor or actor,
        opened_at=now,
        created_by=actor,
    )
    audit.record(
        AuditEvent.COUNSELING_CASE_UPDATED,
        actor=actor,
        resource=case,
        after={"status": case.status, "severity": severity},
        metadata={"action": "open"},
    )
    return case


def read_case(*, actor, case):
    audit.record(AuditEvent.COUNSELING_CASE_ACCESSED, actor=actor, resource=case)
    return case


def _assert_editable(case):
    if case.status == C.CLOSED:
        raise ConflictError(ErrorCode.COUNSELING_CASE_CLOSED, "Kasus sudah ditutup; buka kembali (counseling.reopen) untuk mengubah.")


@transaction.atomic
def update_case(*, actor, case, data, expected_version=None):
    case = CounselingCase.objects.select_for_update().get(pk=case.pk)
    _assert_editable(case)
    if expected_version is not None and expected_version != case.version:
        raise ConflictError(ErrorCode.ATTENDANCE_VERSION_CONFLICT, "Kasus telah diubah pengguna lain.", details={"version": case.version})
    before = {k: str(getattr(case, k)) for k in data}
    for k, v in data.items():
        setattr(case, k, v)
    case.version += 1
    case.full_clean()
    case.save()
    audit.record(
        AuditEvent.COUNSELING_CASE_UPDATED,
        actor=actor,
        resource=case,
        before={k: "…" if k == "details" else v for k, v in before.items()},
        metadata={"fields": sorted(data)},
    )
    return case


@transaction.atomic
def change_status(*, actor, case, target, reason=""):
    case = CounselingCase.objects.select_for_update().get(pk=case.pk)
    if case.status == C.CLOSED:
        if not user_has_perm(actor, "counseling.reopen"):
            raise DomainError(ErrorCode.PERMISSION_DENIED, "Membuka kembali kasus membutuhkan izin counseling.reopen.", status_code=403)
        if target not in {C.OPEN, C.IN_PROGRESS}:
            raise ConflictError(ErrorCode.INVALID_STATE_TRANSITION, "Kasus tertutup hanya dapat dibuka kembali.")
        if not reason.strip():
            raise DomainError(ErrorCode.VALIDATION_ERROR, "Data tidak valid.", fields={"reason": ["Alasan wajib untuk membuka kembali."]})
        case.reopen_reason, case.closed_at = reason, None
    elif target not in TRANSITIONS.get(case.status, set()):
        raise ConflictError(ErrorCode.INVALID_STATE_TRANSITION, f"Transisi {case.status} → {target} tidak diizinkan.")
    before = case.status
    case.status = target
    if target == C.CLOSED:
        case.closed_at = timezone.now()
    case.version += 1
    case.save()
    audit.record(
        AuditEvent.COUNSELING_CASE_UPDATED,
        actor=actor,
        resource=case,
        before={"status": before},
        after={"status": target},
        metadata={"reason": reason[:300]},
    )
    return case


@transaction.atomic
def add_follow_up(*, actor, case, note, follow_up_at=None, next_action_at=None, evidence_file=None):
    case = CounselingCase.objects.select_for_update().get(pk=case.pk)
    _assert_editable(case)
    if evidence_file is not None:
        files.attach(evidence_file, expected_purposes={"COUNSELING_EVIDENCE"}, owner=actor)
    f = CounselingFollowUp.objects.create(
        case=case,
        note=note,
        follow_up_at=follow_up_at or timezone.now(),
        next_action_at=next_action_at,
        created_by=actor,
        evidence_file=evidence_file,
    )
    if case.status == C.OPEN:
        CounselingCase.objects.filter(pk=case.pk).update(status=C.IN_PROGRESS, version=F("version") + 1)
    audit.record(AuditEvent.COUNSELING_CASE_UPDATED, actor=actor, resource=case, metadata={"action": "follow_up"})
    return f


@transaction.atomic
def log_guardian_contact(*, actor, channel, summary, case=None, incident=None, contacted_at=None):
    if case is not None:
        _assert_editable(case)
    c = GuardianContact.objects.create(
        case=case, incident=incident, channel=channel, summary=summary, contacted_at=contacted_at or timezone.now(), created_by=actor
    )
    audit.record(AuditEvent.GUARDIAN_NOTICE_SENT, actor=actor, resource=case or incident, metadata={"channel": channel})
    return c


def summary(user):
    """Aggregate counts without narrative (principal/homeroom dashboards)."""
    from django.db.models import Count

    cases = CounselingCase.objects.values("status").annotate(n=Count("id"))
    sev = CounselingCase.objects.exclude(status=C.CLOSED).values("severity").annotate(n=Count("id"))
    incidents = incidents_visible_to(user).exclude(status="VOID").values("status").annotate(n=Count("id"))
    return {
        "cases_by_status": {r["status"]: r["n"] for r in cases},
        "open_cases_by_severity": {r["severity"]: r["n"] for r in sev},
        "incidents_by_status": {r["status"]: r["n"] for r in incidents},
    }


# ------------------------------------------------------------------ discipline


@transaction.atomic
def record_incident(*, actor, student, data):
    if not user_has_perm(actor, "discipline.manage"):
        raise DomainError(ErrorCode.PERMISSION_DENIED, "Anda tidak memiliki izin mencatat pelanggaran.", status_code=403)
    if not user_has_global(actor, "discipline.manage") and not students_visible_to(actor).filter(pk=student.pk).exists():
        raise ScopeDenied()
    inc = DisciplineIncident(student=student, reported_by=actor, **data)
    inc.full_clean()
    inc.save()
    audit.record(
        AuditEvent.DISCIPLINE_INCIDENT_RECORDED, actor=actor, resource=inc, after={"severity": inc.severity, "category": inc.category}
    )
    return inc


def _can_manage_incident(user, inc):
    return user_has_global(user, "discipline.manage") or inc.reported_by_id == user.pk


@transaction.atomic
def update_incident(*, actor, incident, data):
    inc = DisciplineIncident.objects.select_for_update().get(pk=incident.pk)
    if not _can_manage_incident(actor, inc):
        raise ScopeDenied()
    if inc.status == "VOID":
        raise ConflictError(ErrorCode.INVALID_STATE_TRANSITION, "Insiden VOID tidak dapat diubah.")
    # Teachers may correct their own description; action/resolution belongs to BK/discipline staff.
    allowed = set(data) if user_has_global(actor, "discipline.manage") else {"description", "location", "category", "severity"}
    for k, v in data.items():
        if k in allowed:
            setattr(inc, k, v)
    inc.full_clean()
    inc.save()
    audit.record(
        AuditEvent.DISCIPLINE_INCIDENT_RECORDED,
        actor=actor,
        resource=inc,
        metadata={"action": "update", "fields": sorted(set(data) & allowed)},
    )
    return inc


@transaction.atomic
def void_incident(*, actor, incident, reason):
    inc = DisciplineIncident.objects.select_for_update().get(pk=incident.pk)
    if not user_has_global(actor, "discipline.manage"):
        raise DomainError(ErrorCode.PERMISSION_DENIED, "Hanya BK/kesiswaan yang dapat membatalkan insiden.", status_code=403)
    if inc.status == "VOID":
        raise ConflictError(ErrorCode.INVALID_STATE_TRANSITION, "Insiden sudah VOID.")
    if not reason.strip():
        raise DomainError(ErrorCode.VALIDATION_ERROR, "Data tidak valid.", fields={"reason": ["Wajib."]})
    before = inc.status
    inc.status, inc.void_reason = "VOID", reason
    inc.save(update_fields=["status", "void_reason", "updated_at"])
    audit.record(
        AuditEvent.DISCIPLINE_INCIDENT_VOIDED,
        actor=actor,
        resource=inc,
        before={"status": before},
        after={"status": "VOID"},
        metadata={"reason": reason[:500]},
    )
    return inc


@transaction.atomic
def refer_to_counseling(*, actor, incident):
    inc = DisciplineIncident.objects.select_for_update().get(pk=incident.pk)
    if inc.referred_case_id:
        return inc.referred_case
    case = open_case(
        actor=actor,
        student=inc.student,
        category=f"Rujukan disiplin: {inc.category}",
        severity=inc.severity,
        summary=f"Rujukan insiden {inc.occurred_at:%Y-%m-%d}",
    )
    inc.referred_case, inc.action_type = case, "COUNSELING_REFERRAL"
    inc.save(update_fields=["referred_case", "action_type", "updated_at"])
    return case


@transaction.atomic
def publish_guardian_notice(*, actor, incident, notice):
    """Explicit guardian notice (§26.3): only this text is visible to the portal — never description/internal notes."""
    inc = DisciplineIncident.objects.select_for_update().get(pk=incident.pk)
    if not user_has_global(actor, "discipline.manage"):
        raise DomainError(ErrorCode.PERMISSION_DENIED, "Hanya BK/kesiswaan yang dapat mengirim pemberitahuan wali.", status_code=403)
    if inc.status == "VOID":
        raise ConflictError(ErrorCode.INVALID_STATE_TRANSITION, "Insiden VOID tidak dapat diberitahukan.")
    if not notice.strip():
        raise DomainError(ErrorCode.VALIDATION_ERROR, "Data tidak valid.", fields={"notice": ["Wajib."]})
    inc.guardian_notice, inc.guardian_notified_at = notice, timezone.now()
    inc.save(update_fields=["guardian_notice", "guardian_notified_at", "updated_at"])
    log_guardian_contact(actor=actor, channel="MESSAGE", summary="Pemberitahuan insiden dipublikasikan ke portal wali", incident=inc)
    emit("discipline.guardian_notice", incident_id=str(inc.pk), student_id=str(inc.student_id))
    return inc

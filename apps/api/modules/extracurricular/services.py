"""Membership and attendance rules (PRD §27.2): server-side capacity with waitlist, one open membership per activity,
advisors manage only their assigned activities."""

from django.db import IntegrityError, transaction
from django.utils import timezone

from common.api.exceptions import ConflictError, DomainError, ErrorCode, ScopeDenied
from common.permissions import user_has_global
from modules.academics.selectors import teacher_of
from modules.audit import services as audit
from modules.audit.events import AuditEvent

from .models import ExtracurricularActivity, ExtracurricularAttendance, ExtracurricularMembership

M = ExtracurricularMembership.Status


def can_manage(user, activity):
    if user_has_global(user, "extracurricular.manage"):
        return True
    teacher = teacher_of(user)
    return teacher is not None and activity.advisor_teacher_id == teacher.pk


def _require(user, activity):
    if not can_manage(user, activity):
        raise DomainError(ErrorCode.PERMISSION_DENIED, "Pembina hanya mengelola kegiatan yang ditugaskan.", status_code=403)


@transaction.atomic
def add_member(*, actor, activity, student, role="", allow_waitlist=True):
    activity = ExtracurricularActivity.objects.select_for_update().get(pk=activity.pk)
    _require(actor, activity)
    if not activity.active:
        raise ConflictError(ErrorCode.INVALID_STATE_TRANSITION, "Kegiatan sudah diarsipkan.")
    if ExtracurricularMembership.objects.filter(activity=activity, student=student, status__in=[M.ACTIVE, M.WAITLIST]).exists():
        raise ConflictError(ErrorCode.VALIDATION_ERROR, "Siswa sudah terdaftar di kegiatan ini.")
    active = activity.memberships.filter(status=M.ACTIVE).count()
    status = M.ACTIVE
    if activity.capacity is not None and active >= activity.capacity:
        if not allow_waitlist:
            raise ConflictError(
                ErrorCode.EXTRACURRICULAR_CAPACITY_FULL, "Kapasitas kegiatan penuh.", details={"capacity": activity.capacity}
            )
        status = M.WAITLIST
    try:
        with transaction.atomic():
            m = ExtracurricularMembership.objects.create(
                activity=activity, student=student, joined_at=timezone.localdate(), status=status, role=role
            )
    except IntegrityError:
        raise ConflictError(ErrorCode.VALIDATION_ERROR, "Siswa sudah terdaftar di kegiatan ini.")
    audit.record(AuditEvent.EXTRACURRICULAR_MEMBERSHIP_CHANGED, actor=actor, resource=m, after={"status": status})
    return m


@transaction.atomic
def set_member_status(*, actor, membership, target, note=None):
    m = ExtracurricularMembership.objects.select_for_update().select_related("activity").get(pk=membership.pk)
    activity = ExtracurricularActivity.objects.select_for_update().get(pk=m.activity_id)
    _require(actor, activity)
    if m.status in {M.WITHDRAWN, M.COMPLETED}:
        raise ConflictError(ErrorCode.INVALID_STATE_TRANSITION, "Keanggotaan sudah berakhir.")
    if target == M.ACTIVE and m.status == M.WAITLIST and activity.capacity is not None:
        if activity.memberships.filter(status=M.ACTIVE).count() >= activity.capacity:
            raise ConflictError(ErrorCode.EXTRACURRICULAR_CAPACITY_FULL, "Kapasitas kegiatan penuh.")
    before = m.status
    m.status = target
    if target in {M.WITHDRAWN, M.COMPLETED}:
        m.left_at = timezone.localdate()
    if note is not None:
        m.note = note
    m.save()
    audit.record(
        AuditEvent.EXTRACURRICULAR_MEMBERSHIP_CHANGED, actor=actor, resource=m, before={"status": before}, after={"status": target}
    )
    if before == M.ACTIVE and target in {M.WITHDRAWN, M.COMPLETED}:
        _promote_waitlist(activity)
    return m


def _promote_waitlist(activity):
    nxt = activity.memberships.filter(status=M.WAITLIST).order_by("created_at").first()
    if nxt and (activity.capacity is None or activity.memberships.filter(status=M.ACTIVE).count() < activity.capacity):
        nxt.status = M.ACTIVE
        nxt.save(update_fields=["status", "updated_at"])


@transaction.atomic
def record_attendance(*, actor, activity, date, records):
    """records: [{student, status, note}]; only ACTIVE members; upsert per activity+student+date."""
    _require(actor, activity)
    members = set(activity.memberships.filter(status=M.ACTIVE).values_list("student_id", flat=True))
    saved = 0
    for r in records:
        sid = r["student"].pk if hasattr(r["student"], "pk") else r["student"]
        if sid not in members:
            raise ScopeDenied("Siswa bukan anggota aktif kegiatan ini.")
        ExtracurricularAttendance.objects.update_or_create(
            activity=activity, student_id=sid, date=date, defaults={"status": r["status"], "note": r.get("note", "")}
        )
        saved += 1
    return saved

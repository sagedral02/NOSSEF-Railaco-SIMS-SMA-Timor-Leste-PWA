"""Attendance workflows (PRD §20, §65.5) and idempotent offline sync (§20.4–§20.5, §34.5, ADR-008)."""

import hashlib
import json
from collections import Counter

from django.db import IntegrityError, transaction
from django.db.models import F, Q
from django.utils import timezone

from common.api.exceptions import ConflictError, DomainError, ErrorCode
from common.events import emit
from common.permissions import user_has_global, user_has_perm
from modules.academics.models import Trimester
from modules.academics.selectors import teacher_of
from modules.audit import services as audit
from modules.audit.events import AuditEvent
from modules.schedules.models import ScheduleException
from modules.students.models import EnrollmentStatus, Student, StudentEnrollment

from .models import (
    AttendanceCorrection,
    AttendanceRecord,
    AttendanceSession,
    AttendanceStatus,
    OfflineMutationReceipt,
    StaffAttendance,
    StudentLeaveRequest,
)

S = AttendanceSession.Status


# ------------------------------------------------------------------ roster & scope


def roster(classroom, on_date):
    """Students whose enrollment in `classroom` is effective on `on_date` (transfers in/out respected by dates)."""
    ids = (
        StudentEnrollment.objects.filter(classroom=classroom, start_date__lte=on_date)
        .filter(Q(end_date__isnull=True) | Q(end_date__gte=on_date))
        .exclude(status=EnrollmentStatus.CANCELLED)
        .values("student_id")
    )
    return Student.objects.filter(pk__in=ids).order_by("full_name")


def approved_leave(student_ids, on_date):
    rows = StudentLeaveRequest.objects.filter(
        student_id__in=student_ids, status=StudentLeaveRequest.Status.APPROVED, start_date__lte=on_date, end_date__gte=on_date
    )
    return {r.student_id: r.leave_type for r in rows}


def substitution_for(entry, on_date):
    return ScheduleException.objects.filter(schedule_entry=entry, date=on_date).first()


def can_record(user, session_or_ctx):
    """Teacher may record only for the assigned lesson (or a valid substitution on that date) or own homeroom (DAILY)."""
    if user_has_global(user, "attendance.record"):
        return True
    if not user_has_perm(user, "attendance.record"):
        return False
    teacher = teacher_of(user)
    if teacher is None:
        return False
    s = session_or_ctx
    if s.session_type == AttendanceSession.SessionType.DAILY:
        return s.classroom.homeroom_teacher_id == teacher.pk
    ex = substitution_for(s.schedule_entry, s.date)
    if ex and ex.exception_type == ScheduleException.Type.SUBSTITUTED:
        return ex.substitute_teacher_id == teacher.pk
    if ex and ex.exception_type == ScheduleException.Type.CANCELLED:
        return False
    return s.schedule_entry.teaching_assignment.teacher_id == teacher.pk


def can_view_session(user, session):
    return (
        user_has_global(user, "attendance.view")
        or can_record(user, session)
        or (teacher_of(user) is not None and session.classroom.homeroom_teacher_id == teacher_of(user).pk)
    )


def _deny():
    return DomainError(ErrorCode.PERMISSION_DENIED, "Anda tidak berwenang mencatat absensi rombel/jam ini.", status_code=403)


# ------------------------------------------------------------------ sessions


class _Ctx:
    def __init__(self, classroom, date, session_type, schedule_entry):
        self.classroom, self.date, self.session_type, self.schedule_entry = classroom, date, session_type, schedule_entry


@transaction.atomic
def open_session(*, actor, classroom, date, session_type, schedule_entry=None):
    if date > timezone.localdate():
        raise DomainError(
            ErrorCode.VALIDATION_ERROR, "Data tidak valid.", fields={"date": ["Tidak dapat membuka absensi untuk tanggal mendatang."]}
        )
    if session_type == AttendanceSession.SessionType.LESSON:
        if schedule_entry is None:
            raise DomainError(ErrorCode.VALIDATION_ERROR, "Data tidak valid.", fields={"schedule_entry": ["Wajib untuk absensi per jam."]})
        if schedule_entry.classroom_id != classroom.pk or not schedule_entry.covers(date):
            raise DomainError(
                ErrorCode.VALIDATION_ERROR, "Data tidak valid.", fields={"schedule_entry": ["Jadwal tidak berlaku pada tanggal ini."]}
            )
        ex = substitution_for(schedule_entry, date)
        if ex and ex.exception_type == ScheduleException.Type.CANCELLED:
            raise ConflictError(ErrorCode.INVALID_STATE_TRANSITION, "Pelajaran ini dibatalkan pada tanggal tersebut.")
    else:
        schedule_entry = None
    if not can_record(actor, _Ctx(classroom, date, session_type, schedule_entry)):
        raise _deny()
    trimester = Trimester.objects.filter(academic_year=classroom.academic_year, start_date__lte=date, end_date__gte=date).first()
    if trimester is None:
        raise DomainError(ErrorCode.VALIDATION_ERROR, "Data tidak valid.", fields={"date": ["Tanggal di luar periode trimestre."]})
    if trimester.status in {Trimester.Status.CLOSED, Trimester.Status.DRAFT}:
        raise ConflictError(ErrorCode.INVALID_STATE_TRANSITION, f"Trimestre berstatus {trimester.status}.")
    lookup = {"classroom": classroom, "date": date, "session_type": session_type}
    if schedule_entry is not None:
        lookup = {"schedule_entry": schedule_entry, "date": date, "session_type": session_type}
    existing = AttendanceSession.objects.filter(**lookup).first()
    if existing:
        return existing, False
    try:
        with transaction.atomic():
            session = AttendanceSession.objects.create(
                academic_year=classroom.academic_year,
                trimester=trimester,
                classroom=classroom,
                date=date,
                session_type=session_type,
                schedule_entry=schedule_entry,
                teaching_assignment=schedule_entry.teaching_assignment if schedule_entry else None,
                opened_by=actor,
            )
    except IntegrityError:  # concurrent open of the same session: return the winner
        return AttendanceSession.objects.get(**lookup), False
    return session, True


def _validate_status(status, minutes_late):
    if status not in AttendanceStatus.values:
        raise DomainError(ErrorCode.VALIDATION_ERROR, "Data tidak valid.", fields={"status": ["Status tidak dikenal."]})
    if status == AttendanceStatus.LATE:
        if not minutes_late or minutes_late <= 0 or minutes_late > 600:
            raise DomainError(
                ErrorCode.VALIDATION_ERROR, "Data tidak valid.", fields={"minutes_late": ["Wajib 1–600 menit untuk status LATE."]}
            )
        return minutes_late
    return None


def _record_payload(r):
    return {"student_id": str(r.student_id), "status": r.status, "minutes_late": r.minutes_late, "note": r.note, "version": r.version}


def _assert_writable(session):
    if session.status != S.OPEN:
        raise ConflictError(ErrorCode.ATTENDANCE_SESSION_LOCKED, "Sesi absensi sudah dikirim/dikunci. Gunakan koreksi dengan alasan.")


def _apply_one(*, actor, session, roster_ids, item):
    """Write one record with optimistic version check. Returns (record, outcome) or raises ConflictError."""
    student_id = str(item["student_id"])
    if student_id not in roster_ids:
        raise DomainError(
            ErrorCode.ATTENDANCE_STUDENT_NOT_ENROLLED,
            "Siswa tidak terdaftar di rombel ini pada tanggal sesi.",
            details={"student_id": student_id},
        )
    minutes = _validate_status(item["status"], item.get("minutes_late"))
    note = item.get("note") or ""
    expected = item.get("expected_version")
    rec = AttendanceRecord.objects.select_for_update().filter(session=session, student_id=student_id).first()
    if rec is None:
        if expected not in (None, 0):
            raise ConflictError(ErrorCode.ATTENDANCE_VERSION_CONFLICT, "Data absensi telah berubah di server.", details={"server": None})
        rec = AttendanceRecord.objects.create(
            session=session, student_id=student_id, status=item["status"], minutes_late=minutes, note=note, recorded_by=actor
        )
        return rec, "APPLIED"
    same = rec.status == item["status"] and rec.minutes_late == minutes and (rec.note == note or not note)
    if expected is not None and expected != rec.version:
        if same:
            return rec, "DUPLICATE"
        raise ConflictError(
            ErrorCode.ATTENDANCE_VERSION_CONFLICT, "Data absensi telah berubah di server.", details={"server": _record_payload(rec)}
        )
    if same:
        return rec, "DUPLICATE"
    updated = AttendanceRecord.objects.filter(pk=rec.pk, version=rec.version).update(
        status=item["status"], minutes_late=minutes, note=note, recorded_by=actor, version=F("version") + 1, updated_at=timezone.now()
    )
    if updated != 1:
        raise ConflictError(ErrorCode.ATTENDANCE_VERSION_CONFLICT, "Data absensi telah berubah di server.")
    rec.refresh_from_db()
    return rec, "APPLIED"


@transaction.atomic
def set_records(*, actor, session, items):
    """All-or-nothing bulk upsert (PRD §65.5): any conflict aborts the whole batch with every conflict listed."""
    session = (
        AttendanceSession.objects.select_for_update(of=("self",))
        .select_related("classroom", "schedule_entry__teaching_assignment")
        .get(pk=session.pk)
    )
    if not can_record(actor, session):
        raise _deny()
    _assert_writable(session)
    roster_ids = {str(pk) for pk in roster(session.classroom, session.date).values_list("pk", flat=True)}
    conflicts, results = [], []
    for item in items:
        try:
            with transaction.atomic():
                results.append(_apply_one(actor=actor, session=session, roster_ids=roster_ids, item=item))
        except ConflictError as exc:
            conflicts.append({"student_id": str(item["student_id"]), **exc.details})
    if conflicts:
        raise ConflictError(
            ErrorCode.ATTENDANCE_VERSION_CONFLICT, "Sebagian data absensi telah berubah di server.", details={"conflicts": conflicts}
        )
    if any(outcome == "APPLIED" for _, outcome in results):
        AttendanceSession.objects.filter(pk=session.pk).update(version=F("version") + 1, updated_at=timezone.now())
    session.refresh_from_db()
    return session


@transaction.atomic
def submit(*, actor, session):
    session = (
        AttendanceSession.objects.select_for_update(of=("self",))
        .select_related("classroom", "schedule_entry__teaching_assignment")
        .get(pk=session.pk)
    )
    if not can_record(actor, session):
        raise _deny()
    if session.status != S.OPEN:
        raise ConflictError(ErrorCode.INVALID_STATE_TRANSITION, f"Sesi berstatus {session.status}.")
    roster_ids = set(roster(session.classroom, session.date).values_list("pk", flat=True))
    recorded = set(session.records.values_list("student_id", flat=True))
    missing = roster_ids - recorded
    if missing:
        raise DomainError(
            ErrorCode.VALIDATION_ERROR, f"{len(missing)} siswa belum ditandai.", details={"missing_student_ids": [str(m) for m in missing]}
        )
    session.status = S.SUBMITTED
    session.submitted_at = timezone.now()
    session.version += 1
    session.save(update_fields=["status", "submitted_at", "version", "updated_at"])
    counts = Counter(session.records.values_list("status", flat=True))
    audit.record(AuditEvent.ATTENDANCE_RECORDED, actor=actor, resource=session, after={"counts": dict(counts), "date": str(session.date)})
    emit("attendance.session_submitted", session_id=str(session.pk))
    for rec in session.records.filter(status__in=[AttendanceStatus.ABSENT, AttendanceStatus.LATE]):
        emit(
            "attendance.absent" if rec.status == AttendanceStatus.ABSENT else "attendance.late",
            record_id=str(rec.pk),
            student_id=str(rec.student_id),
        )
    return session


@transaction.atomic
def lock(*, actor, session):
    session = AttendanceSession.objects.select_for_update().get(pk=session.pk)
    if not (user_has_perm(actor, "attendance.approve") or user_has_perm(actor, "attendance.correct")):
        raise DomainError(ErrorCode.PERMISSION_DENIED, "Anda tidak memiliki izin untuk mengunci absensi.", status_code=403)
    if session.status != S.SUBMITTED:
        raise ConflictError(ErrorCode.INVALID_STATE_TRANSITION, f"Sesi berstatus {session.status}.")
    session.status = S.LOCKED
    session.locked_at = timezone.now()
    session.version += 1
    session.save(update_fields=["status", "locked_at", "version", "updated_at"])
    audit.record(AuditEvent.ATTENDANCE_LOCKED, actor=actor, resource=session)
    return session


@transaction.atomic
def correct(*, actor, record, to_status, minutes_late=None, reason=""):
    record = (
        AttendanceRecord.objects.select_for_update(of=("self",))
        .select_related("session__classroom", "session__schedule_entry__teaching_assignment")
        .get(pk=record.pk)
    )
    session = record.session
    if not reason.strip():
        raise DomainError(ErrorCode.VALIDATION_ERROR, "Data tidak valid.", fields={"reason": ["Alasan koreksi wajib diisi."]})
    privileged = user_has_perm(actor, "attendance.correct")
    if not privileged and not (session.status == S.SUBMITTED and can_record(actor, session)):
        raise DomainError(ErrorCode.PERMISSION_DENIED, "Koreksi sesi terkunci membutuhkan izin attendance.correct.", status_code=403)
    if session.status == S.OPEN:
        raise ConflictError(ErrorCode.INVALID_STATE_TRANSITION, "Sesi masih terbuka; ubah langsung tanpa koreksi.")
    minutes = _validate_status(to_status, minutes_late)
    if record.status == to_status and record.minutes_late == minutes:
        return record
    AttendanceCorrection.objects.create(
        attendance_record=record,
        from_status=record.status,
        to_status=to_status,
        reason=reason,
        requested_by=actor,
        approved_by=actor if privileged else None,
    )
    before = _record_payload(record)
    record.status, record.minutes_late, record.version = to_status, minutes, record.version + 1
    record.save(update_fields=["status", "minutes_late", "version", "updated_at"])
    AttendanceSession.objects.filter(pk=session.pk).update(version=F("version") + 1)
    audit.record(
        AuditEvent.ATTENDANCE_CORRECTED,
        actor=actor,
        resource=record,
        before=before,
        after=_record_payload(record),
        metadata={"reason": reason[:500]},
    )
    emit("attendance.record_corrected", record_id=str(record.pk))
    return record


# ------------------------------------------------------------------ offline sync


def _hash(obj):
    return hashlib.sha256(json.dumps(obj, sort_keys=True, default=str).encode()).hexdigest()


def offline_sync(*, actor, device_id, session, base_session_version, mutations):
    """Apply a batch of offline mutations idempotently (PRD §20.4–§20.5).

    Each mutation is processed in its own transaction with a receipt keyed by (user, mutation_id):
    replay returns the stored result; different payload under the same id is rejected; version conflicts are
    reported (never last-write-wins)."""
    results = []
    for m in mutations:
        mid = str(m["mutation_id"])
        payload = {
            "session_id": str(session.pk),
            "student_id": str(m["student_id"]),
            "status": m["status"],
            "minutes_late": m.get("minutes_late"),
            "note": m.get("note") or "",
            "base_record_version": m.get("base_record_version"),
        }
        h = _hash(payload)
        with transaction.atomic():
            prior = OfflineMutationReceipt.objects.select_for_update().filter(user=actor, mutation_id=mid).first()
            if prior is not None:
                if prior.request_hash != h:
                    results.append({"mutation_id": mid, "result": "REJECTED", "code": ErrorCode.OFFLINE_MUTATION_REPLAY_MISMATCH})
                else:
                    results.append({**(prior.response_snapshot or {}), "mutation_id": mid, "replayed": True})
                continue
            result = _apply_offline(actor=actor, session=session, payload=payload)
            OfflineMutationReceipt.objects.create(
                mutation_id=mid,
                user=actor,
                device_id=device_id[:100],
                mutation_type="attendance.record",
                request_hash=h,
                resource_id=result.get("record_id"),
                result_status=result["result"],
                response_snapshot=result,
            )
            results.append({**result, "mutation_id": mid})
    session.refresh_from_db()
    return {
        "session_id": str(session.pk),
        "session_version": session.version,
        "session_status": session.status,
        "base_session_version": base_session_version,
        "results": results,
    }


def _apply_offline(*, actor, session, payload):
    try:
        with transaction.atomic():
            s = (
                AttendanceSession.objects.select_for_update(of=("self",))
                .select_related("classroom", "schedule_entry__teaching_assignment")
                .get(pk=session.pk)
            )
            if not can_record(actor, s):
                return {"result": "REJECTED", "code": ErrorCode.PERMISSION_DENIED}
            existing = AttendanceRecord.objects.filter(session=s, student_id=payload["student_id"]).first()
            if s.status != S.OPEN:
                if existing and existing.status == payload["status"] and existing.minutes_late == payload["minutes_late"]:
                    return {"result": "DUPLICATE", "record_id": str(existing.pk), "server": _record_payload(existing)}
                return {
                    "result": "CONFLICT" if existing else "REJECTED",
                    "code": ErrorCode.ATTENDANCE_SESSION_LOCKED,
                    "server": _record_payload(existing) if existing else None,
                }
            roster_ids = {str(pk) for pk in roster(s.classroom, s.date).values_list("pk", flat=True)}
            rec, outcome = _apply_one(
                actor=actor, session=s, roster_ids=roster_ids, item={**payload, "expected_version": payload["base_record_version"]}
            )
            if outcome == "APPLIED":
                AttendanceSession.objects.filter(pk=s.pk).update(version=F("version") + 1)
            return {"result": outcome, "record_id": str(rec.pk), "server": _record_payload(rec)}
    except ConflictError as exc:
        return {"result": "CONFLICT", "code": exc.error_code, "server": exc.details.get("server")}
    except DomainError as exc:
        return {"result": "REJECTED", "code": exc.error_code, "message": exc.message}


# ------------------------------------------------------------------ summaries


def student_summary(student, *, date_from=None, date_to=None, trimester=None):
    qs = AttendanceRecord.objects.filter(student=student, session__status__in=[S.SUBMITTED, S.LOCKED])
    if trimester is not None:
        qs = qs.filter(session__trimester=trimester)
    if date_from:
        qs = qs.filter(session__date__gte=date_from)
    if date_to:
        qs = qs.filter(session__date__lte=date_to)
    daily = Counter(qs.filter(session__session_type="DAILY").values_list("status", flat=True))
    lesson = Counter(qs.filter(session__session_type="LESSON").values_list("status", flat=True))
    base = daily or lesson
    total = sum(base.values())
    present = base.get("PRESENT", 0) + base.get("LATE", 0)
    return {
        "daily": {k: daily.get(k, 0) for k in AttendanceStatus.values},
        "lesson": {k: lesson.get(k, 0) for k in AttendanceStatus.values},
        "basis": "DAILY" if daily else "LESSON",
        "total": total,
        "attendance_rate": round(100 * present / total, 1) if total else None,
    }


# ------------------------------------------------------------------ leave requests


@transaction.atomic
def request_leave(*, actor, student, data, supporting_file=None):
    if data["start_date"] > data["end_date"]:
        raise DomainError(ErrorCode.VALIDATION_ERROR, "Data tidak valid.", fields={"end_date": ["Harus setelah tanggal mulai."]})
    return StudentLeaveRequest.objects.create(student=student, supporting_file=supporting_file, requested_by=actor, **data)


@transaction.atomic
def review_leave(*, actor, leave, approve, note=""):
    leave = StudentLeaveRequest.objects.select_for_update().get(pk=leave.pk)
    if leave.status != StudentLeaveRequest.Status.PENDING:
        raise ConflictError(ErrorCode.INVALID_STATE_TRANSITION, f"Permohonan berstatus {leave.status}.")
    leave.status = StudentLeaveRequest.Status.APPROVED if approve else StudentLeaveRequest.Status.REJECTED
    leave.reviewed_by, leave.review_note = actor, note
    leave.save(update_fields=["status", "reviewed_by", "review_note", "updated_at"])
    audit.record("LEAVE_REQUEST_REVIEWED", actor=actor, resource=leave, after={"status": leave.status})
    return leave


@transaction.atomic
def upsert_staff_attendance(*, actor, data):
    person = {"teacher": data.get("teacher")} if data["person_type"] == "TEACHER" else {"staff": data.get("staff")}
    obj = StaffAttendance.objects.filter(date=data["date"], **person).select_for_update().first()
    before = None
    if obj is None:
        obj = StaffAttendance(**data, recorded_by=actor)
    else:
        before = {"status": obj.status}
        for k in ("status", "check_in_at", "check_out_at", "note"):
            setattr(obj, k, data.get(k, getattr(obj, k)))
    obj.full_clean()
    obj.save()
    if before and before["status"] != obj.status:
        audit.record(AuditEvent.ATTENDANCE_CORRECTED, actor=actor, resource=obj, before=before, after={"status": obj.status})
    return obj

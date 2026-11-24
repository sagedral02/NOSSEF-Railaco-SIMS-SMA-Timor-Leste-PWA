"""Collision engine and schedule workflows (PRD §19.1, §65.7)."""

from datetime import date, timedelta

from django.db import connection, transaction
from django.db.models import Q

from common.api.exceptions import ConflictError, DomainError, ErrorCode
from common.events import emit
from modules.audit import services as audit
from modules.audit.events import AuditEvent

from .models import ScheduleEntry, ScheduleException


def _overlapping(valid_from, valid_until):
    q = Q(valid_until__isnull=True) | Q(valid_until__gte=valid_from)
    if valid_until is not None:
        q &= Q(valid_from__lte=valid_until)
    return q


def find_conflicts(*, classroom, teaching_assignment, weekday, bell_period, room, valid_from, valid_until, exclude_id=None):
    """Return a list of {code, entry_id} conflicts for a candidate recurring slot."""
    base = ScheduleEntry.objects.filter(active=True, weekday=weekday, bell_period=bell_period).filter(_overlapping(valid_from, valid_until))
    if exclude_id:
        base = base.exclude(pk=exclude_id)
    out = []
    for e in base.filter(teaching_assignment__teacher_id=teaching_assignment.teacher_id).values_list("id", flat=True):
        out.append({"code": ErrorCode.SCHEDULE_TEACHER_CONFLICT, "entry_id": str(e)})
    for e in base.filter(classroom=classroom).values_list("id", flat=True):
        out.append({"code": ErrorCode.SCHEDULE_CLASS_CONFLICT, "entry_id": str(e)})
    if room is not None:
        for e in base.filter(room=room).values_list("id", flat=True):
            out.append({"code": ErrorCode.SCHEDULE_ROOM_CONFLICT, "entry_id": str(e)})
    return out


def _validate_shape(*, academic_year, classroom, teaching_assignment, valid_from, valid_until):
    if teaching_assignment.classroom_id != classroom.pk or classroom.academic_year_id != academic_year.pk or not teaching_assignment.active:
        raise DomainError(ErrorCode.SCHEDULE_ASSIGNMENT_MISMATCH, "Penugasan mengajar tidak sesuai rombel/tahun ajaran.")
    if valid_from < academic_year.start_date or (valid_until or academic_year.end_date) > academic_year.end_date:
        raise DomainError(ErrorCode.SCHEDULE_DATE_OUTSIDE_YEAR, "Masa berlaku jadwal harus di dalam tahun ajaran.")


def _raise_first(conflicts):
    if conflicts:
        code = conflicts[0]["code"]
        messages = {
            ErrorCode.SCHEDULE_TEACHER_CONFLICT: "Guru sudah mengajar di jam yang sama.",
            ErrorCode.SCHEDULE_CLASS_CONFLICT: "Rombel sudah memiliki pelajaran di jam yang sama.",
            ErrorCode.SCHEDULE_ROOM_CONFLICT: "Ruang sudah dipakai di jam yang sama.",
        }
        raise ConflictError(code, messages[code], details={"conflicts": conflicts})


def validate_entry(data, exclude_id=None):
    _validate_shape(
        **{k: data[k] for k in ("academic_year", "classroom", "teaching_assignment", "valid_from")}, valid_until=data.get("valid_until")
    )
    return find_conflicts(
        classroom=data["classroom"],
        teaching_assignment=data["teaching_assignment"],
        weekday=data["weekday"],
        bell_period=data["bell_period"],
        room=data.get("room"),
        valid_from=data["valid_from"],
        valid_until=data.get("valid_until"),
        exclude_id=exclude_id,
    )


def _lock_slot(weekday, bell_period):
    """Transaction-scoped advisory lock per weekday/period: concurrent writers cannot both pass the collision check."""
    with connection.cursor() as cur:
        cur.execute("SELECT pg_advisory_xact_lock(%s, %s)", [7101 + int(weekday), bell_period.sequence])


def _snap(e):
    return {
        "classroom": e.classroom.name,
        "weekday": e.weekday,
        "bell_period": e.bell_period.name,
        "room": e.room.code if e.room else None,
        "teacher": e.teaching_assignment.teacher.full_name,
        "subject": e.teaching_assignment.subject_offering.subject.code,
        "valid_from": str(e.valid_from),
        "valid_until": str(e.valid_until) if e.valid_until else None,
        "active": e.active,
    }


@transaction.atomic
def create_entry(*, actor, data):
    _lock_slot(data["weekday"], data["bell_period"])
    _raise_first(validate_entry(data))
    entry = ScheduleEntry.objects.create(**data)
    audit.record(AuditEvent.SCHEDULE_CREATED, actor=actor, resource=entry, after=_snap(entry))
    emit("schedule.changed", entry_id=str(entry.pk))
    return entry


@transaction.atomic
def update_entry(*, actor, entry, data):
    entry = ScheduleEntry.objects.select_for_update().get(pk=entry.pk)
    _lock_slot(data.get("weekday", entry.weekday), data.get("bell_period", entry.bell_period))
    before = _snap(entry)
    merged = {
        f: data.get(f, getattr(entry, f))
        for f in (
            "academic_year",
            "trimester",
            "classroom",
            "teaching_assignment",
            "weekday",
            "bell_period",
            "room",
            "valid_from",
            "valid_until",
            "active",
        )
    }
    if merged["active"]:
        _raise_first(validate_entry(merged, exclude_id=entry.pk))
    for k, v in merged.items():
        setattr(entry, k, v)
    entry.save()
    b, a = audit.diff(before, _snap(entry))
    if a:
        audit.record(AuditEvent.SCHEDULE_CHANGED, actor=actor, resource=entry, before=b, after=a)
        emit("schedule.changed", entry_id=str(entry.pk))
    return entry


def effective_for_date(entries, on_date, exceptions):
    """Apply one-date exceptions to the recurring entries of `on_date` (moved entries take their new period)."""
    return [(e, exceptions.get((e.pk, on_date))) for e in entries if e.covers(on_date)]


def teacher_busy(teacher, on_date, bell_period, exclude_entry_id=None):
    """Is the teacher teaching (recurring or as substitute) at this date/period, after applying exceptions?"""
    weekday = on_date.isoweekday()
    recurring = ScheduleEntry.objects.filter(active=True, weekday=weekday, teaching_assignment__teacher=teacher).filter(
        _overlapping(on_date, on_date)
    )
    if exclude_entry_id:
        recurring = recurring.exclude(pk=exclude_entry_id)
    for e in recurring.select_related("bell_period"):
        ex = ScheduleException.objects.filter(schedule_entry=e, date=on_date).first()
        if ex and ex.exception_type in {"CANCELLED", "SUBSTITUTED"}:
            continue
        slot = ex.new_bell_period_id if ex and ex.exception_type == "MOVED" and ex.new_bell_period_id else e.bell_period_id
        if slot == bell_period.pk:
            return True
    subs = ScheduleException.objects.filter(date=on_date, substitute_teacher=teacher).select_related("schedule_entry")
    return any((s.new_bell_period_id or s.schedule_entry.bell_period_id) == bell_period.pk for s in subs)


@transaction.atomic
def create_exception(*, actor, entry, data):
    entry = (
        ScheduleEntry.objects.select_for_update(of=("self",))
        .select_related("bell_period", "classroom", "teaching_assignment")
        .get(pk=entry.pk)
    )
    on_date = data["date"]
    if not entry.covers(on_date):
        raise DomainError(
            ErrorCode.VALIDATION_ERROR, "Data tidak valid.", fields={"date": ["Jadwal ini tidak berlaku pada tanggal tersebut."]}
        )
    if ScheduleException.objects.filter(schedule_entry=entry, date=on_date).exists():
        raise ConflictError(ErrorCode.VALIDATION_ERROR, "Pengecualian untuk tanggal ini sudah ada.")
    kind = data["exception_type"]
    slot = data.get("new_bell_period") or entry.bell_period
    if kind == ScheduleException.Type.SUBSTITUTED:
        sub = data.get("substitute_teacher")
        if sub is None:
            raise DomainError(ErrorCode.VALIDATION_ERROR, "Data tidak valid.", fields={"substitute_teacher": ["Wajib diisi."]})
        if sub.pk == entry.teaching_assignment.teacher_id or teacher_busy(sub, on_date, slot):
            raise ConflictError(ErrorCode.SCHEDULE_TEACHER_CONFLICT, "Guru pengganti sudah mengajar di jam yang sama.")
    if kind == ScheduleException.Type.MOVED:
        if not data.get("new_bell_period") and not data.get("new_room"):
            raise DomainError(ErrorCode.VALIDATION_ERROR, "Data tidak valid.", fields={"new_bell_period": ["Isi jam atau ruang baru."]})
        if slot.pk != entry.bell_period_id:
            if teacher_busy(entry.teaching_assignment.teacher, on_date, slot, exclude_entry_id=entry.pk):
                raise ConflictError(ErrorCode.SCHEDULE_TEACHER_CONFLICT, "Guru sudah mengajar di jam tujuan.")
            class_busy = (
                ScheduleEntry.objects.filter(active=True, classroom=entry.classroom, weekday=on_date.isoweekday(), bell_period=slot)
                .filter(_overlapping(on_date, on_date))
                .exclude(exceptions__date=on_date, exceptions__exception_type__in=["CANCELLED", "MOVED"])
            )
            if class_busy.exists():
                raise ConflictError(ErrorCode.SCHEDULE_CLASS_CONFLICT, "Rombel sudah memiliki pelajaran di jam tujuan.")
        room = data.get("new_room")
        if room is not None:
            room_busy = (
                ScheduleEntry.objects.filter(active=True, room=room, weekday=on_date.isoweekday(), bell_period=slot)
                .filter(_overlapping(on_date, on_date))
                .exclude(pk=entry.pk)
            )
            if room_busy.exists():
                raise ConflictError(ErrorCode.SCHEDULE_ROOM_CONFLICT, "Ruang sudah dipakai di jam tujuan.")
    ex = ScheduleException.objects.create(schedule_entry=entry, **data)
    event = AuditEvent.SUBSTITUTE_ASSIGNED if kind == ScheduleException.Type.SUBSTITUTED else AuditEvent.SCHEDULE_CHANGED
    audit.record(
        event,
        actor=actor,
        resource=entry,
        after={"date": str(on_date), "type": kind, "substitute": str(ex.substitute_teacher_id) if ex.substitute_teacher_id else None},
        metadata={"reason": ex.reason[:500]},
    )
    emit("schedule.changed", entry_id=str(entry.pk), date=str(on_date))
    return ex


def week_of(on_date):
    monday = on_date - timedelta(days=on_date.isoweekday() - 1)
    return [monday + timedelta(days=i) for i in range(7)]


def weekly_timetable(entries_qs, on_date: date):
    """Timetable for the ISO week containing `on_date`, exceptions applied (for teacher/student/guardian views)."""
    days = week_of(on_date)
    entries = list(
        entries_qs.filter(_overlapping(days[0], days[-1])).select_related(
            "classroom", "bell_period", "room", "teaching_assignment__teacher", "teaching_assignment__subject_offering__subject"
        )
    )
    ex_rows = ScheduleException.objects.filter(schedule_entry__in=[e.pk for e in entries], date__range=(days[0], days[-1])).select_related(
        "new_bell_period", "new_room", "substitute_teacher"
    )
    exceptions = {(x.schedule_entry_id, x.date): x for x in ex_rows}
    out = []
    for d in days:
        for e, ex in effective_for_date(entries, d, exceptions):
            out.append(
                {
                    "date": d,
                    "weekday": d.isoweekday(),
                    "entry_id": e.pk,
                    "bell_period_id": (ex.new_bell_period_id if ex and ex.new_bell_period_id else e.bell_period_id),
                    "bell_period": (ex.new_bell_period.name if ex and ex.new_bell_period_id else e.bell_period.name),
                    "start_time": (ex.new_bell_period.start_time if ex and ex.new_bell_period_id else e.bell_period.start_time),
                    "end_time": (ex.new_bell_period.end_time if ex and ex.new_bell_period_id else e.bell_period.end_time),
                    "classroom": e.classroom.name,
                    "classroom_id": e.classroom_id,
                    "subject_code": e.teaching_assignment.subject_offering.subject.code,
                    "subject_name": e.teaching_assignment.subject_offering.subject.name,
                    "teacher": (
                        ex.substitute_teacher.full_name if ex and ex.substitute_teacher_id else e.teaching_assignment.teacher.full_name
                    ),
                    "room": (ex.new_room.code if ex and ex.new_room_id else (e.room.code if e.room_id else None)),
                    "exception": ex.exception_type if ex else None,
                    "exception_reason": ex.reason if ex else None,
                    "teaching_assignment_id": e.teaching_assignment_id,
                }
            )
    return out

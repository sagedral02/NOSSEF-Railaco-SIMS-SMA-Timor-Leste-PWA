"""PRD §20.7 attendance + offline tests (server side)."""

import uuid
from datetime import date, time, timedelta

import pytest
from rest_framework.test import APIClient

from common.api.exceptions import DomainError
from modules.academics.models import BellPeriod
from modules.academics.services import activate_year, advance_trimester
from modules.academics.tests.factories import make_assignment, make_class, make_offering, make_teacher, make_year
from modules.attendance import services
from modules.attendance.models import AttendanceRecord
from modules.audit.models import AuditLog
from modules.schedules import services as sched
from modules.students import services as students

pytestmark = pytest.mark.django_db
DAY = date(2030, 3, 4)  # Monday inside Trimestre 1 of the factory year


@pytest.fixture(autouse=True)
def _today(monkeypatch):
    """The factory year is 2030; pin "today" inside it so the no-future-date rule is exercised realistically."""
    monkeypatch.setattr("modules.attendance.services.timezone.localdate", lambda: date(2030, 3, 20))


@pytest.fixture
def ctx(make_user):
    admin = make_user("tu", roles=["SCHOOL_ADMIN", "CURRICULUM_ADMIN"])
    year = make_year()
    bell = BellPeriod.objects.create(name="Jam 1", sequence=1, start_time=time(7, 30), end_time=time(8, 15))
    teacher_user = make_user("guru", roles=["TEACHER"])
    other_user = make_user("lain", roles=["TEACHER"])
    teacher, other = make_teacher("Guru", user=teacher_user), make_teacher("Lain", user=other_user)
    cls = make_class(year, "X-IPA-1", homeroom=teacher)
    cls2 = make_class(year, "X-IPA-2")
    offering = make_offering(year)
    ta = make_assignment(teacher, cls, offering)
    make_assignment(other, cls2, offering)
    activate_year(actor=admin, year=year)
    advance_trimester(actor=admin, trimester=year.trimesters.get(number=1), target="ACTIVE")
    entry = sched.create_entry(
        actor=admin,
        data={
            "academic_year": year,
            "classroom": cls,
            "teaching_assignment": ta,
            "weekday": 1,
            "bell_period": bell,
            "room": None,
            "valid_from": year.start_date,
        },
    )
    kids = [
        students.create_student(
            actor=admin,
            data={"full_name": f"Siswa {i}", "birth_date": date(2014, 1, i + 1), "admission_date": year.start_date},
            classroom=cls,
        )
        for i in range(3)
    ]
    return {
        "admin": admin,
        "year": year,
        "cls": cls,
        "cls2": cls2,
        "entry": entry,
        "teacher_user": teacher_user,
        "other_user": other_user,
        "other": other,
        "kids": kids,
        "bell": bell,
    }


def _lesson(ctx, user=None, on=DAY):
    s, _ = services.open_session(
        actor=user or ctx["teacher_user"], classroom=ctx["cls"], date=on, session_type="LESSON", schedule_entry=ctx["entry"]
    )
    return s


def _sync(ctx, session, mutations, user=None):
    return services.offline_sync(
        actor=user or ctx["teacher_user"], device_id="dev-1", session=session, base_session_version=session.version, mutations=mutations
    )


def test_same_mutation_three_times_applies_once(ctx):
    s = _lesson(ctx)
    m = {"mutation_id": uuid.uuid4(), "student_id": ctx["kids"][0].pk, "status": "ABSENT", "base_record_version": None}
    results = [_sync(ctx, s, [m])["results"][0] for _ in range(3)]
    assert results[0]["result"] == "APPLIED" and results[1].get("replayed") and results[2].get("replayed")
    assert AttendanceRecord.objects.get(session=s, student=ctx["kids"][0]).version == 1
    tampered = _sync(ctx, s, [{**m, "status": "PRESENT"}])["results"][0]
    assert tampered["result"] == "REJECTED" and tampered["code"] == "OFFLINE_MUTATION_REPLAY_MISMATCH"


def test_conflict_returns_conflict_instead_of_overwrite(ctx):
    s = _lesson(ctx)
    kid = ctx["kids"][0]
    services.set_records(actor=ctx["teacher_user"], session=s, items=[{"student_id": kid.pk, "status": "PRESENT"}])
    # Someone else changes it online (version 2) while the device still holds version 1.
    services.set_records(actor=ctx["teacher_user"], session=s, items=[{"student_id": kid.pk, "status": "SICK", "expected_version": 1}])
    r = _sync(ctx, s, [{"mutation_id": uuid.uuid4(), "student_id": kid.pk, "status": "ABSENT", "base_record_version": 1}])["results"][0]
    assert r["result"] == "CONFLICT" and r["server"]["status"] == "SICK"
    assert AttendanceRecord.objects.get(session=s, student=kid).status == "SICK"
    same = _sync(ctx, s, [{"mutation_id": uuid.uuid4(), "student_id": kid.pk, "status": "SICK", "base_record_version": 1}])["results"][0]
    assert same["result"] == "DUPLICATE"  # different version but same desired state = equivalent success


def test_teacher_outside_assignment_denied(ctx):
    with pytest.raises(DomainError) as exc:
        _lesson(ctx, user=ctx["other_user"])
    assert exc.value.error_code == "PERMISSION_DENIED"
    with pytest.raises(DomainError):
        services.open_session(actor=ctx["other_user"], classroom=ctx["cls"], date=DAY, session_type="DAILY")  # not homeroom
    services.open_session(actor=ctx["teacher_user"], classroom=ctx["cls"], date=DAY, session_type="DAILY")


def test_substitute_permission_valid_only_for_that_date(ctx):
    sched.create_exception(
        actor=ctx["admin"],
        entry=ctx["entry"],
        data={"date": DAY, "exception_type": "SUBSTITUTED", "substitute_teacher": ctx["other"], "reason": "Sakit"},
    )
    s = _lesson(ctx, user=ctx["other_user"])
    assert s.date == DAY
    with pytest.raises(DomainError):
        _lesson(ctx, user=ctx["teacher_user"])  # the regular teacher is replaced that day
    with pytest.raises(DomainError):
        _lesson(ctx, user=ctx["other_user"], on=DAY + timedelta(days=7))


def test_late_minutes_validation(ctx):
    s = _lesson(ctx)
    with pytest.raises(DomainError) as exc:
        services.set_records(actor=ctx["teacher_user"], session=s, items=[{"student_id": ctx["kids"][0].pk, "status": "LATE"}])
    assert "minutes_late" in exc.value.fields
    services.set_records(
        actor=ctx["teacher_user"], session=s, items=[{"student_id": ctx["kids"][0].pk, "status": "LATE", "minutes_late": 10}]
    )


def test_blank_is_not_present_and_locked_session_rejects_direct_patch(ctx):
    s = _lesson(ctx)
    services.set_records(actor=ctx["teacher_user"], session=s, items=[{"student_id": ctx["kids"][0].pk, "status": "PRESENT"}])
    with pytest.raises(DomainError) as exc:
        services.submit(actor=ctx["teacher_user"], session=s)
    assert "2 siswa" in exc.value.message
    services.set_records(actor=ctx["teacher_user"], session=s, items=[{"student_id": k.pk, "status": "PRESENT"} for k in ctx["kids"]])
    services.submit(actor=ctx["teacher_user"], session=s)
    services.lock(actor=ctx["admin"], session=s)
    api = APIClient()
    api.force_authenticate(ctx["teacher_user"])
    r = api.patch(f"/api/v1/attendance/sessions/{s.pk}/records/{ctx['kids'][0].pk}/", {"status": "ABSENT"}, format="json")
    assert r.status_code == 409 and r.json()["error"]["code"] == "ATTENDANCE_SESSION_LOCKED"


def test_correction_requires_reason_and_audit(ctx):
    s = _lesson(ctx)
    services.set_records(actor=ctx["teacher_user"], session=s, items=[{"student_id": k.pk, "status": "PRESENT"} for k in ctx["kids"]])
    services.submit(actor=ctx["teacher_user"], session=s)
    rec = AttendanceRecord.objects.get(session=s, student=ctx["kids"][1])
    with pytest.raises(DomainError):
        services.correct(actor=ctx["teacher_user"], record=rec, to_status="ABSENT", reason="")
    services.correct(actor=ctx["teacher_user"], record=rec, to_status="ABSENT", reason="Salah tandai")
    rec.refresh_from_db()
    assert rec.status == "ABSENT" and rec.version == 2 and rec.corrections.count() == 1
    assert AuditLog.objects.filter(event_type="ATTENDANCE_CORRECTED").exists()
    services.lock(actor=ctx["admin"], session=s)
    with pytest.raises(DomainError):
        services.correct(actor=ctx["teacher_user"], record=rec, to_status="PRESENT", reason="x")  # locked: privileged only
    services.correct(actor=ctx["admin"], record=rec, to_status="PRESENT", reason="Bukti surat")


def test_transfer_out_and_in_respect_effective_date(ctx):
    leaving, staying = ctx["kids"][0], ctx["kids"][1]
    students.transfer_internal(actor=ctx["admin"], student=leaving, classroom=ctx["cls2"], effective_date=DAY)
    newcomer = students.create_student(
        actor=ctx["admin"],
        data={"full_name": "Pindahan", "birth_date": date(2014, 5, 5), "admission_date": DAY},
        classroom=ctx["cls"],
        start_date=DAY,
    )
    before = {s.pk for s in services.roster(ctx["cls"], DAY - timedelta(days=1))}
    on = {s.pk for s in services.roster(ctx["cls"], DAY)}
    assert leaving.pk in before and leaving.pk not in on
    assert newcomer.pk in on and newcomer.pk not in before and staying.pk in on
    s = _lesson(ctx)
    with pytest.raises(DomainError) as exc:
        services.set_records(actor=ctx["teacher_user"], session=s, items=[{"student_id": leaving.pk, "status": "PRESENT"}])
    assert exc.value.error_code == "ATTENDANCE_STUDENT_NOT_ENROLLED"


def test_open_session_is_idempotent_and_api_roster(ctx):
    api = APIClient()
    api.force_authenticate(ctx["teacher_user"])
    body = {"schedule_entry": str(ctx["entry"].pk), "session_type": "LESSON", "date": str(DAY)}
    first = api.post("/api/v1/attendance/sessions/", body, format="json")
    second = api.post("/api/v1/attendance/sessions/", body, format="json")
    assert first.status_code == 201 and second.status_code == 200
    assert first.json()["data"]["id"] == second.json()["data"]["id"]
    assert len(first.json()["data"]["roster"]) == 3 and first.json()["data"]["can_record"]
    mine = api.get(f"/api/v1/attendance/my-classes/?date={DAY}").json()["data"]
    assert mine["lessons"][0]["session_id"] == first.json()["data"]["id"]

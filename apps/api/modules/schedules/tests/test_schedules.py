"""PRD §19.4 scheduling tests."""

from datetime import date, time

import pytest

from common.api.exceptions import DomainError
from modules.academics.models import BellPeriod, Room
from modules.academics.tests.factories import make_assignment, make_class, make_offering, make_teacher, make_year
from modules.schedules import services
from modules.schedules.models import ScheduleEntry

pytestmark = pytest.mark.django_db
MONDAY = date(2030, 3, 4)


@pytest.fixture
def ctx(make_user):
    actor = make_user("kur", roles=["CURRICULUM_ADMIN"])
    year = make_year()
    b1 = BellPeriod.objects.create(name="Jam 1", sequence=1, start_time=time(7, 30), end_time=time(8, 15))
    b2 = BellPeriod.objects.create(name="Jam 2", sequence=2, start_time=time(8, 15), end_time=time(9, 0))
    room = Room.objects.create(code="R1", name="R1")
    t1, t2 = make_teacher("Guru A"), make_teacher("Guru B")
    c1, c2 = make_class(year, "X-IPA-1"), make_class(year, "X-IPA-2")
    mat, fis = make_offering(year, "MAT"), make_offering(year, "FIS", major_code="IPA")
    return {
        "actor": actor,
        "year": year,
        "b1": b1,
        "b2": b2,
        "room": room,
        "t1": t1,
        "t2": t2,
        "c1": c1,
        "c2": c2,
        "a11": make_assignment(t1, c1, mat),
        "a12": make_assignment(t1, c2, mat),
        "a21": make_assignment(t2, c1, fis),
        "a22": make_assignment(t2, c2, fis),
    }


def _entry(ctx, ta, bell, room=None, weekday=1):
    return services.create_entry(
        actor=ctx["actor"],
        data={
            "academic_year": ctx["year"],
            "classroom": ta.classroom,
            "teaching_assignment": ta,
            "weekday": weekday,
            "bell_period": bell,
            "room": room,
            "valid_from": ctx["year"].start_date,
        },
    )


def test_teacher_double_booking_rejected(ctx):
    _entry(ctx, ctx["a11"], ctx["b1"])
    with pytest.raises(DomainError) as exc:
        _entry(ctx, ctx["a12"], ctx["b1"])
    assert exc.value.error_code == "SCHEDULE_TEACHER_CONFLICT"
    _entry(ctx, ctx["a12"], ctx["b1"], weekday=2)  # other day is fine


def test_class_double_booking_rejected(ctx):
    _entry(ctx, ctx["a11"], ctx["b1"])
    with pytest.raises(DomainError) as exc:
        _entry(ctx, ctx["a21"], ctx["b1"])
    assert exc.value.error_code == "SCHEDULE_CLASS_CONFLICT"


def test_room_double_booking_rejected(ctx):
    _entry(ctx, ctx["a11"], ctx["b1"], room=ctx["room"])
    with pytest.raises(DomainError) as exc:
        _entry(ctx, ctx["a22"], ctx["b1"], room=ctx["room"])
    assert exc.value.error_code == "SCHEDULE_ROOM_CONFLICT"


def test_assignment_mismatch_and_outside_year(ctx):
    with pytest.raises(DomainError) as exc:
        services.create_entry(
            actor=ctx["actor"],
            data={
                "academic_year": ctx["year"],
                "classroom": ctx["c2"],
                "teaching_assignment": ctx["a11"],
                "weekday": 1,
                "bell_period": ctx["b1"],
                "room": None,
                "valid_from": ctx["year"].start_date,
            },
        )
    assert exc.value.error_code == "SCHEDULE_ASSIGNMENT_MISMATCH"
    with pytest.raises(DomainError) as exc:
        services.create_entry(
            actor=ctx["actor"],
            data={
                "academic_year": ctx["year"],
                "classroom": ctx["c1"],
                "teaching_assignment": ctx["a11"],
                "weekday": 1,
                "bell_period": ctx["b1"],
                "room": None,
                "valid_from": date(2029, 12, 1),
            },
        )
    assert exc.value.error_code == "SCHEDULE_DATE_OUTSIDE_YEAR"


def test_cancelled_exception_affects_only_target_date(ctx):
    e = _entry(ctx, ctx["a11"], ctx["b1"])
    services.create_exception(actor=ctx["actor"], entry=e, data={"date": MONDAY, "exception_type": "CANCELLED", "reason": "Upacara"})
    week1 = services.weekly_timetable(ScheduleEntry.objects.all(), MONDAY)
    week2 = services.weekly_timetable(ScheduleEntry.objects.all(), date(2030, 3, 11))
    assert [s["exception"] for s in week1] == ["CANCELLED"]
    assert [s["exception"] for s in week2] == [None]


def test_substitute_conflict_rejected(ctx):
    e1 = _entry(ctx, ctx["a11"], ctx["b1"])
    _entry(ctx, ctx["a22"], ctx["b1"])  # Guru B teaches X-IPA-2 at the same time
    with pytest.raises(DomainError) as exc:
        services.create_exception(
            actor=ctx["actor"],
            entry=e1,
            data={"date": MONDAY, "exception_type": "SUBSTITUTED", "substitute_teacher": ctx["t2"], "reason": "Sakit"},
        )
    assert exc.value.error_code == "SCHEDULE_TEACHER_CONFLICT"
    free = make_teacher("Guru C")
    ex = services.create_exception(
        actor=ctx["actor"], entry=e1, data={"date": MONDAY, "exception_type": "SUBSTITUTED", "substitute_teacher": free, "reason": "Sakit"}
    )
    assert ex.substitute_teacher == free
    assert services.teacher_busy(free, MONDAY, ctx["b1"])


def test_historical_schedule_remains_queryable(ctx, as_role):
    e = _entry(ctx, ctx["a11"], ctx["b1"])
    services.update_entry(actor=ctx["actor"], entry=e, data={"valid_until": date(2030, 3, 31)})
    _entry_after = services.create_entry(
        actor=ctx["actor"],
        data={
            "academic_year": ctx["year"],
            "classroom": ctx["c1"],
            "teaching_assignment": ctx["a21"],
            "weekday": 1,
            "bell_period": ctx["b1"],
            "room": None,
            "valid_from": date(2030, 4, 1),
        },
    )
    march = services.weekly_timetable(ScheduleEntry.objects.all(), MONDAY)
    april = services.weekly_timetable(ScheduleEntry.objects.all(), date(2030, 4, 8))
    assert [s["subject_code"] for s in march] == ["MAT"]
    assert [s["subject_code"] for s in april] == ["FIS"]
    assert _entry_after.pk


def test_api_validate_and_permissions(ctx, as_role):
    _entry(ctx, ctx["a11"], ctx["b1"])
    api = as_role("CURRICULUM_ADMIN")
    r = api.post(
        "/api/v1/schedules/validate/",
        {"teaching_assignment": str(ctx["a12"].pk), "weekday": 1, "bell_period": str(ctx["b1"].pk)},
        format="json",
    )
    assert r.json()["data"]["ok"] is False and r.json()["data"]["conflicts"][0]["code"] == "SCHEDULE_TEACHER_CONFLICT"
    teacher = as_role("TEACHER")
    assert (
        teacher.post(
            "/api/v1/schedules/", {"teaching_assignment": str(ctx["a12"].pk), "weekday": 3, "bell_period": str(ctx["b1"].pk)}, format="json"
        ).status_code
        == 403
    )
    tt = api.get(f"/api/v1/schedules/timetable/?classroom_id={ctx['c1'].pk}&date={MONDAY}").json()["data"]
    assert tt["title"] == ctx["c1"].name and len(tt["slots"]) == 1

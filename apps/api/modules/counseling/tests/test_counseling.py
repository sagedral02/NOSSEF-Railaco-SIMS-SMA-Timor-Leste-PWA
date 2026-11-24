"""PRD §26.5 + F10 exit criteria; §27.2 extracurricular constraints."""

from datetime import date

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from common.api.exceptions import DomainError
from modules.academics.tests.factories import make_assignment, make_class, make_offering, make_teacher, make_year
from modules.audit.models import AuditLog
from modules.counseling import services
from modules.counseling.models import DisciplineIncident
from modules.extracurricular import services as ekskul
from modules.extracurricular.models import ExtracurricularActivity
from modules.students import services as students
from modules.students.models import Guardian

pytestmark = pytest.mark.django_db


def _api(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


@pytest.fixture
def ctx(make_user):
    bk = make_user("bk", roles=["COUNSELOR"])
    guru_u = make_user("guru", roles=["TEACHER"])
    admin = make_user("adm", roles=["SCHOOL_ADMIN"])
    year = make_year()
    teacher = make_teacher("Guru", user=guru_u)
    cls = make_class(year)
    make_assignment(teacher, cls, make_offering(year, "MAT"))
    kids = [
        students.create_student(
            actor=admin,
            data={"full_name": f"Siswa {i}", "birth_date": date(2014, 1, 1 + i), "admission_date": year.start_date},
            classroom=cls,
        )
        for i in range(3)
    ]
    return {"bk": bk, "guru": guru_u, "teacher": teacher, "admin": admin, "year": year, "kids": kids}


def test_teacher_cannot_read_counseling_notes(ctx):
    case = services.open_case(
        actor=ctx["bk"], student=ctx["kids"][0], category="Keluarga", severity="HIGH", summary="Ringkas", details="RAHASIA-123"
    )
    r = _api(ctx["guru"]).get(f"/api/v1/counseling/cases/{case.pk}/")
    assert r.status_code == 403 and b"RAHASIA" not in r.content
    assert _api(ctx["guru"]).get("/api/v1/counseling/cases/").status_code == 403
    r = _api(ctx["bk"]).get(f"/api/v1/counseling/cases/{case.pk}/")
    assert r.status_code == 200 and r.json()["data"]["details"] == "RAHASIA-123"
    assert AuditLog.objects.filter(event_type="COUNSELING_CASE_ACCESSED", resource_id=str(case.pk)).exists()
    # list never carries narrative
    assert "details" not in _api(ctx["bk"]).get("/api/v1/counseling/cases/").json()["data"][0]


def test_counselor_sees_students_without_finance(ctx):
    api = _api(ctx["bk"])
    assert api.get(f"/api/v1/students/{ctx['kids'][0].pk}/").status_code == 200
    assert api.get("/api/v1/finance/reports/summary/").status_code == 403
    assert api.get("/api/v1/finance/invoices/").json()["data"] == []


def test_closed_case_immutable_until_reopened(ctx, make_user):
    case = services.open_case(actor=ctx["bk"], student=ctx["kids"][0], category="x", severity="LOW", summary="s")
    services.change_status(actor=ctx["bk"], case=case, target="CLOSED")
    with pytest.raises(DomainError) as exc:
        services.add_follow_up(actor=ctx["bk"], case=case, note="n")
    assert exc.value.error_code == "COUNSELING_CASE_CLOSED"
    with pytest.raises(DomainError):
        services.change_status(actor=ctx["bk"], case=case, target="IN_PROGRESS", reason="")
    services.change_status(actor=ctx["bk"], case=case, target="IN_PROGRESS", reason="Masalah muncul lagi")
    services.add_follow_up(actor=ctx["bk"], case=case, note="lanjut")
    case.refresh_from_db()
    assert case.reopen_reason == "Masalah muncul lagi" and case.follow_ups.count() == 1


def test_void_incident_stays_in_history_and_audit(ctx):
    inc = services.record_incident(
        actor=ctx["guru"],
        student=ctx["kids"][0],
        data={"occurred_at": timezone.now(), "category": "Terlambat", "severity": "LOW", "description": "x"},
    )
    with pytest.raises(DomainError):
        services.void_incident(actor=ctx["guru"], incident=inc, reason="salah")  # teacher cannot void
    services.void_incident(actor=ctx["bk"], incident=inc, reason="Salah siswa")
    assert DisciplineIncident.objects.filter(pk=inc.pk, status="VOID").exists()
    assert AuditLog.objects.filter(event_type="DISCIPLINE_INCIDENT_VOIDED", resource_id=str(inc.pk)).exists()
    r = _api(ctx["bk"]).get("/api/v1/discipline/incidents/", {"status": "VOID"})
    assert len(r.json()["data"]) == 1


def test_teacher_reads_own_reports_only(ctx, make_user):
    other = make_user("guru2", roles=["TEACHER"])
    make_teacher("Guru 2", user=other)
    services.record_incident(
        actor=ctx["guru"],
        student=ctx["kids"][0],
        data={"occurred_at": timezone.now(), "category": "A", "severity": "LOW", "description": "d"},
    )
    assert len(_api(ctx["guru"]).get("/api/v1/discipline/incidents/").json()["data"]) == 1
    assert _api(other).get("/api/v1/discipline/incidents/").json()["data"] == []


def test_guardian_notice_does_not_leak_internal_notes(ctx, make_user):
    gu = make_user("wali", roles=["GUARDIAN"])
    students.link_guardian(
        actor=ctx["admin"], student=ctx["kids"][0], guardian=Guardian.objects.create(full_name="W", user=gu), relationship="MOTHER"
    )
    inc = services.record_incident(
        actor=ctx["bk"],
        student=ctx["kids"][0],
        data={
            "occurred_at": timezone.now(),
            "category": "Bolos",
            "severity": "MEDIUM",
            "description": "INTERNAL-NOTE",
            "action_taken": "INTERNAL-ACTION",
        },
    )
    api = _api(gu)
    assert api.get("/api/v1/discipline/notices/").json()["data"] == []  # nothing until explicitly published
    assert api.get("/api/v1/discipline/incidents/").status_code == 403
    services.publish_guardian_notice(actor=ctx["bk"], incident=inc, notice="Mohon hadir rapat orang tua.")
    r = api.get("/api/v1/discipline/notices/")
    body = r.content.decode()
    assert "Mohon hadir" in body and "INTERNAL" not in body


def test_extracurricular_capacity_waitlist_and_duplicates(ctx):
    act = ExtracurricularActivity.objects.create(academic_year=ctx["year"], name="Futsal", capacity=1, advisor_teacher=ctx["teacher"])
    a = ekskul.add_member(actor=ctx["guru"], activity=act, student=ctx["kids"][0])
    b = ekskul.add_member(actor=ctx["guru"], activity=act, student=ctx["kids"][1])
    assert (a.status, b.status) == ("ACTIVE", "WAITLIST")
    with pytest.raises(DomainError):
        ekskul.add_member(actor=ctx["guru"], activity=act, student=ctx["kids"][0])
    with pytest.raises(DomainError) as exc:
        ekskul.add_member(actor=ctx["guru"], activity=act, student=ctx["kids"][2], allow_waitlist=False)
    assert exc.value.error_code == "EXTRACURRICULAR_CAPACITY_FULL"
    ekskul.set_member_status(actor=ctx["guru"], membership=a, target="WITHDRAWN")
    b.refresh_from_db()
    assert b.status == "ACTIVE"  # waitlist promoted; withdrawn history kept
    assert act.memberships.count() == 2


def test_advisor_manages_only_assigned_activity(ctx, make_user):
    other = make_user("guru3", roles=["TEACHER"])
    make_teacher("Guru 3", user=other)
    act = ExtracurricularActivity.objects.create(academic_year=ctx["year"], name="Musik", advisor_teacher=ctx["teacher"])
    r = _api(other).post(f"/api/v1/extracurricular/activities/{act.pk}/members/", {"student": str(ctx["kids"][0].pk)}, format="json")
    assert r.status_code == 403
    r = _api(ctx["guru"]).post(f"/api/v1/extracurricular/activities/{act.pk}/members/", {"student": str(ctx["kids"][0].pk)}, format="json")
    assert r.status_code == 201
    r = _api(ctx["guru"]).post(
        f"/api/v1/extracurricular/activities/{act.pk}/attendance/",
        {"date": "2030-02-02", "records": [{"student": str(ctx["kids"][0].pk), "status": "PRESENT"}]},
        format="json",
    )
    assert r.status_code == 200 and r.json()["data"]["saved"] == 1

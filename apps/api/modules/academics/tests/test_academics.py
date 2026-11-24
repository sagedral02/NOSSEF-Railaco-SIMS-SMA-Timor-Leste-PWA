"""F2 exit criteria (PRD §61 F2, §18, §22.1, §54 INT-002..INT-007)."""

from datetime import date

import pytest
from django.db import IntegrityError, transaction

from common.api.exceptions import DomainError
from conftest import assert_role_matrix
from modules.academics import services
from modules.academics.models import AcademicYear, Trimester
from modules.audit.models import AuditLog

from .factories import make_assignment, make_class, make_offering, make_teacher, make_year, ready_year

pytestmark = pytest.mark.django_db


def test_cau_must_equal_trimester_number_in_database():
    year = make_year(trimesters=False)
    with pytest.raises(IntegrityError), transaction.atomic():
        Trimester.objects.create(
            academic_year=year, number=2, cau_number=1, name="T2", start_date=date(2030, 4, 1), end_date=date(2030, 6, 1)
        )


def test_api_derives_cau_from_number_and_rejects_fourth_trimester(as_role):
    api = as_role("CURRICULUM_ADMIN")
    year = make_year(trimesters=False)
    r = api.post(
        "/api/v1/trimestres/",
        {"academic_year": str(year.pk), "number": 2, "cau_number": 1, "start_date": "2030-04-20", "end_date": "2030-08-07"},
        format="json",
    )
    assert r.status_code == 201, r.content
    assert r.json()["data"]["cau_number"] == 2 and r.json()["data"]["name"] == "Trimestre 2"
    bad = api.post(
        "/api/v1/trimestres/",
        {"academic_year": str(year.pk), "number": 4, "start_date": "2030-09-01", "end_date": "2030-10-01"},
        format="json",
    )
    assert bad.status_code == 400


def test_overlapping_or_outside_trimesters_rejected(as_role):
    api = as_role("CURRICULUM_ADMIN")
    year = make_year(trimesters=False)
    ok = api.post(
        "/api/v1/trimestres/",
        {"academic_year": str(year.pk), "number": 1, "start_date": "2030-01-07", "end_date": "2030-04-10"},
        format="json",
    )
    assert ok.status_code == 201
    overlap = api.post(
        "/api/v1/trimestres/",
        {"academic_year": str(year.pk), "number": 2, "start_date": "2030-04-01", "end_date": "2030-08-07"},
        format="json",
    )
    assert overlap.status_code == 400
    outside = api.post(
        "/api/v1/trimestres/",
        {"academic_year": str(year.pk), "number": 3, "start_date": "2030-08-20", "end_date": "2031-01-10"},
        format="json",
    )
    assert outside.status_code == 400 and "start_date" in outside.json()["error"]["fields"]


def test_activation_gate_requires_three_trimesters(make_user):
    actor = make_user("kur", roles=["CURRICULUM_ADMIN"])
    year = make_year(trimesters=False)
    with pytest.raises(DomainError) as exc:
        services.activate_year(actor=actor, year=year)
    assert exc.value.error_code == "TRIMESTER_COUNT_INVALID"
    assert any(c["code"] == "three_trimesters" and not c["ok"] for c in exc.value.details["checks"])


def test_activation_gate_full_flow_and_single_current(as_role):
    api = as_role("CURRICULUM_ADMIN")
    year = ready_year()
    readiness = api.get(f"/api/v1/academic-years/{year.pk}/readiness/").json()["data"]
    assert all(c["ok"] for c in readiness), readiness
    r = api.post(f"/api/v1/academic-years/{year.pk}/activate/")
    assert r.status_code == 200 and r.json()["data"]["status"] == "ACTIVE" and r.json()["data"]["is_current"]
    assert AuditLog.objects.filter(event_type="ACADEMIC_YEAR_ACTIVATED").exists()
    other = make_year(name="2031", start=date(2031, 1, 6), end=date(2031, 12, 5), trimesters=False)
    blocked = api.post(f"/api/v1/academic-years/{other.pk}/activate/")
    assert blocked.status_code == 409
    assert AcademicYear.objects.filter(is_current=True).count() == 1


def test_trimester_flow_and_close_year(make_user):
    actor = make_user("kur", roles=["CURRICULUM_ADMIN"])
    year = ready_year()
    services.activate_year(actor=actor, year=year)
    t1, t2, t3 = year.trimesters.order_by("number")
    services.advance_trimester(actor=actor, trimester=t1, target="ACTIVE")
    with pytest.raises(DomainError):
        services.advance_trimester(actor=actor, trimester=t2, target="ACTIVE")  # T1 still active
    with pytest.raises(DomainError):
        services.close_year(actor=actor, year=year)
    for t in (t1, t2, t3):
        t.refresh_from_db()
        if t.status == "DRAFT":
            services.advance_trimester(actor=actor, trimester=t, target="ACTIVE")
        services.advance_trimester(actor=actor, trimester=t, target="GRADING")
        services.advance_trimester(actor=actor, trimester=t, target="CLOSED")
    assert services.close_year(actor=actor, year=year).status == "CLOSED"


def test_multiple_rombels_per_grade_major(as_role):
    api = as_role("CURRICULUM_ADMIN")
    year = make_year()
    from modules.academics.models import GradeLevel, Major

    ids = {g.code: str(g.pk) for g in GradeLevel.objects.all()}
    majors = {m.code: str(m.pk) for m in Major.objects.all()}
    for g in ("X", "XI", "XII"):
        for m in ("IPA", "IPS"):
            for n in (1, 2):
                r = api.post(
                    "/api/v1/classrooms/",
                    {
                        "academic_year": str(year.pk),
                        "grade_level": ids[g],
                        "major": majors[m],
                        "code": f"{g}-{m}-{n}",
                        "name": f"{g} {m} {n}",
                    },
                    format="json",
                )
                assert r.status_code == 201, r.content
    dup = api.post(
        "/api/v1/classrooms/",
        {"academic_year": str(year.pk), "grade_level": ids["X"], "major": majors["IPA"], "code": "X-IPA-1", "name": "dup"},
        format="json",
    )
    assert dup.status_code == 400
    assert len(api.get(f"/api/v1/classrooms/?academic_year_id={year.pk}&grade_level_id={ids['X']}").json()["data"]) == 4


def test_offering_incompatible_with_classroom_rejected(as_role):
    api = as_role("CURRICULUM_ADMIN")
    year = make_year()
    cls = make_class(year, code="X-IPA-1", major_code="IPA")
    ips_only = make_offering(year, "ECO", major_code="IPS")
    xi_offering = make_offering(year, "MAT", grade_code="XI")
    teacher = make_teacher()
    for off in (ips_only, xi_offering):
        r = api.post(
            "/api/v1/teaching-assignments/",
            {"teacher": str(teacher.pk), "classroom": str(cls.pk), "subject_offering": str(off.pk)},
            format="json",
        )
        assert r.status_code == 400 and "subject_offering" in r.json()["error"]["fields"], r.content
    good = make_offering(year, "FIS", major_code="IPA")
    ok = api.post(
        "/api/v1/teaching-assignments/",
        {"teacher": str(teacher.pk), "classroom": str(cls.pk), "subject_offering": str(good.pk)},
        format="json",
    )
    assert ok.status_code == 201
    assert ok.json()["data"]["academic_year"] == str(year.pk)
    again = api.post(
        "/api/v1/teaching-assignments/",
        {"teacher": str(make_teacher("B").pk), "classroom": str(cls.pk), "subject_offering": str(good.pk)},
        format="json",
    )
    assert again.status_code == 400


def test_closed_year_configuration_is_read_only(as_role, make_user):
    actor = make_user("kur", roles=["CURRICULUM_ADMIN"])
    year = ready_year()
    services.activate_year(actor=actor, year=year)
    for t in year.trimesters.order_by("number"):
        services.advance_trimester(actor=actor, trimester=t, target="ACTIVE")
        services.advance_trimester(actor=actor, trimester=t, target="GRADING")
        services.advance_trimester(actor=actor, trimester=t, target="CLOSED")
    services.close_year(actor=actor, year=year)
    api = as_role("CURRICULUM_ADMIN")
    off = year.subject_offerings.first()
    r = api.patch(f"/api/v1/subject-offerings/{off.pk}/", {"weekly_periods": 9}, format="json")
    assert r.status_code == 400 and "academic_year" in r.json()["error"]["fields"]


def test_single_homeroom_per_teacher_per_year():
    year = make_year()
    t = make_teacher()
    make_class(year, code="A", homeroom=t)
    with pytest.raises(IntegrityError), transaction.atomic():
        make_class(year, code="B", homeroom=t)


def test_referenced_master_data_cannot_be_deleted(as_role):
    api = as_role("CURRICULUM_ADMIN")
    year = make_year()
    cls = make_class(year)
    off = make_offering(year)
    make_assignment(make_teacher(), cls, off)
    r = api.delete(f"/api/v1/classrooms/{cls.pk}/")
    assert r.status_code == 409 and r.json()["error"]["code"] == "RESOURCE_IN_USE"


def test_academic_write_permissions(as_role):
    year = make_year()
    assert_role_matrix(
        as_role,
        "post",
        "/api/v1/subjects/",
        data={"code": "XYZ", "name": "Test", "category": "CORE"},
        allowed=["CURRICULUM_ADMIN"],
        denied=["TEACHER", "FINANCE_ADMIN", "STUDENT", "PRINCIPAL"],
        ok_status=(201, 400),
    )
    assert as_role("TEACHER").get(f"/api/v1/classrooms/?academic_year_id={year.pk}").status_code == 200
    assert as_role("GUARDIAN").get("/api/v1/classrooms/").status_code == 403

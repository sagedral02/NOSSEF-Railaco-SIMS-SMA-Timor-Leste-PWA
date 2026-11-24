import pytest

from conftest import assert_role_matrix

pytestmark = pytest.mark.django_db


def test_teacher_crud_and_unique_employee_no(as_role):
    api = as_role("SCHOOL_ADMIN")
    r = api.post("/api/v1/staff/teachers/", {"full_name": "Guru Satu", "employee_no": "E-1"}, format="json")
    assert r.status_code == 201, r.content
    dup = api.post("/api/v1/staff/teachers/", {"full_name": "Guru Dua", "employee_no": "E-1"}, format="json")
    assert dup.status_code == 400 and "employee_no" in str(dup.json()["error"]["fields"])
    blank = api.post("/api/v1/staff/teachers/", {"full_name": "Guru Tiga", "employee_no": ""}, format="json")
    assert blank.status_code == 201  # empty employee numbers are stored as NULL and may repeat
    assert api.get("/api/v1/staff/teachers/?q=guru").json()["meta"]["count"] == 2


def test_staff_permissions(as_role):
    assert_role_matrix(
        as_role,
        "post",
        "/api/v1/staff/staff/",
        data={"full_name": "Staf", "position": "Guarda"},
        allowed=["SCHOOL_ADMIN"],
        denied=["TEACHER", "FINANCE_ADMIN", "STUDENT", "PRINCIPAL"],
    )
    assert as_role("PRINCIPAL").get("/api/v1/staff/staff/").status_code == 200

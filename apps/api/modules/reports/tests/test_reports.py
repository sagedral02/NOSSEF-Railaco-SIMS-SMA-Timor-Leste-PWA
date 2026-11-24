"""F13 exit criteria: no import writes before confirm, exports respect object scope, dashboard totals reconcile."""

import io
from datetime import date
from decimal import Decimal

import pytest
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from openpyxl import Workbook, load_workbook
from rest_framework.test import APIClient

from modules.academics.tests.factories import make_assignment, make_class, make_offering, make_teacher, make_year
from modules.finance import services as finance
from modules.finance.models import FeePlan, FeeType
from modules.finance.seeding import seed_fee_types
from modules.reports import dashboard
from modules.reports.catalog import REPORTS
from modules.reports.models import ReportJob
from modules.students import services as students
from modules.students.models import Student

pytestmark = pytest.mark.django_db
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _api(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


@pytest.fixture
def ctx(make_user):
    admin = make_user("adm", roles=["SCHOOL_ADMIN"])
    tu = make_user("guru", roles=["TEACHER", "HOMEROOM_TEACHER"])
    year = make_year()
    year.is_current = True
    year.save(update_fields=["is_current"])
    t = make_teacher("Guru", user=tu)
    c1 = make_class(year, "X-IPA-1", homeroom=t)
    c2 = make_class(year, "X-IPA-2")
    make_assignment(t, c1, make_offering(year, "MAT"))

    def mk(i, c):
        data = {"full_name": f"S{i}", "birth_date": date(2014, 1, 1 + i), "admission_date": year.start_date}
        return students.create_student(actor=admin, data=data, classroom=c)

    kids = [mk(0, c1), mk(1, c1), mk(2, c2)]
    return {"admin": admin, "tu": tu, "year": year, "c1": c1, "c2": c2, "kids": kids}


def test_export_respects_object_scope(ctx, django_capture_on_commit_callbacks):
    _, rows = REPORTS["STU-01"].build(ctx["tu"], {})
    assert {r[0] for r in rows} == {ctx["c1"].name} and len(rows) == 2  # teacher sees own class only
    _, rows = REPORTS["STU-01"].build(ctx["admin"], {})
    assert len(rows) == 3
    with django_capture_on_commit_callbacks(execute=True):
        r = _api(ctx["tu"]).post("/api/v1/reports/jobs/", {"report_type": "STU-01", "format": "CSV"}, format="json")
    assert r.status_code == 201
    job = ReportJob.objects.get(pk=r.json()["data"]["id"])
    assert job.status == "SUCCEEDED" and job.row_count == 2
    assert _api(ctx["tu"]).post("/api/v1/reports/jobs/", {"report_type": "FIN-01", "format": "CSV"}, format="json").status_code == 403
    # Another user cannot download the export file
    assert _api(ctx["admin"]).get(f"/api/v1/files/{job.result_file_id}/download/").status_code == 404
    assert _api(ctx["tu"]).get(f"/api/v1/files/{job.result_file_id}/download/").status_code == 200


def test_student_import_writes_nothing_before_confirm(ctx, django_capture_on_commit_callbacks):
    api = _api(ctx["admin"])
    wb = Workbook()
    ws = wb.active
    ws.append(
        [
            "student_no",
            "national_student_no",
            "full_name",
            "gender",
            "birth_date",
            "birth_place",
            "admission_date",
            "classroom_code",
            "phone",
            "guardian_name",
            "guardian_phone",
            "guardian_relationship",
        ]
    )
    ws.append(["", "", "Baru Satu", "F", "2011-03-04", "Dili", "", "X-IPA-1", "", "Mama", "+670", "MOTHER"])
    ws.append(["", "", "S0", "M", "2014-01-01", "", "", "", "", "", "", ""])  # duplicate suspect (same name + birth date)
    ws.append(["", "", "Salah", "X", "04/03/2011", "", "", "", "", "", "", ""])  # invalid gender + date (no silent coercion)
    buf = io.BytesIO()
    wb.save(buf)
    before = Student.objects.count()
    r = api.post(
        "/api/v1/imports/",
        {"import_type": "STUDENTS", "file": SimpleUploadedFile("s.xlsx", buf.getvalue(), content_type=XLSX)},
        format="multipart",
    )
    job = r.json()["data"]
    assert Student.objects.count() == before
    assert job["status"] == "INVALID" and {e["error_code"] for e in job["row_errors"]} >= {
        "IMPORT_DUPLICATE_SUSPECTED",
        "IMPORT_INVALID_CHOICE",
        "IMPORT_INVALID_DATE",
    }
    # fix the file: only the valid row
    wb2 = Workbook()
    wb2.active.append([c.value for c in ws[1]])
    wb2.active.append([c.value for c in ws[2]])
    buf2 = io.BytesIO()
    wb2.save(buf2)
    r = api.post(
        "/api/v1/imports/",
        {"import_type": "STUDENTS", "file": SimpleUploadedFile("s2.xlsx", buf2.getvalue(), content_type=XLSX)},
        format="multipart",
    )
    job = r.json()["data"]
    assert job["status"] == "READY" and job["preview"][0]["action"] == "CREATE" and Student.objects.count() == before
    with django_capture_on_commit_callbacks(execute=True):
        api.post(f"/api/v1/imports/{job['id']}/confirm/")
    s = Student.objects.get(full_name="Baru Satu")
    assert s.enrollments.get().classroom == ctx["c1"] and s.guardian_links.get().relationship == "MOTHER"


def test_import_template_has_version_metadata(ctx):
    r = _api(ctx["admin"]).get("/api/v1/imports/template/", {"import_type": "ASSETS"})
    wb = load_workbook(io.BytesIO(r.content))
    meta = {row[0].value: row[1].value for row in wb["_meta"].iter_rows()}
    assert meta["import_type"] == "ASSETS" and meta["template_version"] == "1"


def test_dashboard_reconciles_with_finance_report(ctx, make_user):
    seed_fee_types()
    fin = make_user("fin", roles=["FINANCE_ADMIN"])
    FeePlan.objects.create(academic_year=ctx["year"], fee_type=FeeType.objects.get(code="SPP"), amount=Decimal("10.00"), status="ACTIVE")
    finance.generate_invoices(actor=fin, year=ctx["year"], period="2030-02")
    inv = ctx["kids"][0].invoices.get()
    finance.record_cash_payment(actor=fin, student=ctx["kids"][0], amount="4", allocations=[{"invoice": inv.pk, "amount": "4"}])
    cache.clear()
    d = dashboard.build(fin)
    fin_sec = next(s for s in d["sections"] if s["key"] == "dash.sec.finance")
    rate = next(w for w in fin_sec["widgets"] if w["key"] == "dash.collectionRate")["value"]
    _, rows = REPORTS["FIN-01"].build(fin, {})
    total = sum(Decimal(str(r[8])) for r in rows)
    paid = sum(Decimal(str(r[9])) for r in rows)
    assert rate == f"{round(float(paid) * 100 / float(total), 1)}%" and total == Decimal("30.00")


def test_job_monitor_requires_view_jobs_and_hides_foreign_files(as_role):
    from conftest import assert_role_matrix
    from modules.reports.models import ReportJob

    owner = as_role("SCHOOL_ADMIN")
    ReportJob.objects.create(requested_by=owner.user, report_type="STU-01", status="SUCCEEDED")
    assert_role_matrix(
        as_role, "get", "/api/v1/admin/jobs/", allowed=["SCHOOL_ADMIN", "SUPER_ADMIN"], denied=["TEACHER", "STUDENT", "GUARDIAN"]
    )
    res = as_role("SUPER_ADMIN").get("/api/v1/admin/jobs/?kind=REPORT")
    body = res.json()
    rows = body["data"] if isinstance(body, dict) and "data" in body else body
    assert rows and rows[0]["requested_by"] == owner.user.username and rows[0]["result_file"] is None

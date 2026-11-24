"""F7-15 score import: template → upload/preview (no writes) → confirm → scores saved through save_scores."""

import io
import json

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from openpyxl import load_workbook
from rest_framework.test import APIClient

from modules.assessments.models import StudentScore
from modules.integrations.models import ImportJob

from . import test_assessments as base

ctx = base.ctx
_assess = base._assess

pytestmark = pytest.mark.django_db
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _client(user):
    api = APIClient()
    api.force_authenticate(user)
    return api


def _filled(api, ctx, values):
    r = api.get("/api/v1/imports/template/", {"import_type": "SCORES", "teaching_assignment": ctx["ta"].pk, "trimester": ctx["t1"].pk})
    assert r.status_code == 200
    wb = load_workbook(io.BytesIO(r.content))
    ws = wb.worksheets[0]
    for i, v in enumerate(values, start=2):
        ws.cell(row=i, column=3, value=v)
    buf = io.BytesIO()
    wb.save(buf)
    return SimpleUploadedFile("nilai.xlsx", buf.getvalue(), content_type=XLSX)


def test_import_preview_then_confirm(ctx, django_capture_on_commit_callbacks):
    a = _assess(ctx, "TPC")
    api = _client(ctx["tu"])
    f = _filled(api, ctx, [8, "A", 7.5])
    r = api.post(
        "/api/v1/imports/",
        {
            "import_type": "SCORES",
            "file": f,
            "params": json.dumps({"teaching_assignment": str(ctx["ta"].pk), "trimester": str(ctx["t1"].pk)}),
        },
        format="multipart",
        HTTP_IDEMPOTENCY_KEY="k1",
    )
    assert r.status_code == 201, r.content
    job = r.json()["data"]
    assert job["status"] == "READY" and job["valid_rows"] == 3
    assert not StudentScore.objects.exists()  # preview never writes
    with django_capture_on_commit_callbacks(execute=True):
        r = api.post(f"/api/v1/imports/{job['id']}/confirm/")
    assert r.status_code == 200
    assert ImportJob.objects.get(pk=job["id"]).status == "COMPLETED"
    rows = {s.student_id: s for s in StudentScore.objects.filter(assessment=a)}
    assert len(rows) == 3 and sorted(s.status for s in rows.values()) == ["ABSENT", "GRADED", "GRADED"]
    r = api.post(f"/api/v1/imports/{job['id']}/confirm/")
    assert r.status_code == 409 and r.json()["error"]["code"] == "IMPORT_ALREADY_CONFIRMED"


def test_import_invalid_rows_block_confirm(ctx):
    _assess(ctx, "TPC")
    api = _client(ctx["tu"])
    f = _filled(api, ctx, [8, 11, "x"])
    r = api.post(
        "/api/v1/imports/",
        {
            "import_type": "SCORES",
            "file": f,
            "params": json.dumps({"teaching_assignment": str(ctx["ta"].pk), "trimester": str(ctx["t1"].pk)}),
        },
        format="multipart",
    )
    job = r.json()["data"]
    assert job["status"] == "INVALID" and job["invalid_rows"] == 2 and len(job["row_errors"]) == 2
    r = api.post(f"/api/v1/imports/{job['id']}/confirm/")
    assert r.status_code == 409 and r.json()["error"]["code"] == "IMPORT_HAS_ERRORS"


def test_import_scope_other_teacher_404(ctx):
    _assess(ctx, "TPC")
    r = _client(ctx["other"]).get(
        "/api/v1/imports/template/", {"import_type": "SCORES", "teaching_assignment": ctx["ta"].pk, "trimester": ctx["t1"].pk}
    )
    assert r.status_code == 404

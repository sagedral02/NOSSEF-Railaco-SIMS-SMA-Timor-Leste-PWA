"""Student 360 documents tab (PRD §17.4, §31.2): aggregated list, filtered by file read access."""

from datetime import date

import pytest

from modules.documents import services as files
from modules.students import services

pytestmark = pytest.mark.django_db

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


@pytest.fixture
def student_with_photo(make_user, settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path
    admin = make_user("tu_docs", roles=["SCHOOL_ADMIN"])
    st = services.create_student(
        actor=admin, data={"full_name": "Siswa Dokumen", "birth_date": date(2010, 5, 5), "admission_date": date(2030, 1, 7)}
    )
    st.photo_file = files.store_bytes(PNG, original_name="foto.png", purpose="STUDENT_PHOTO", uploaded_by=admin, attached=True)
    st.save(update_fields=["photo_file"])
    return st


def test_staff_sees_student_documents(as_role, student_with_photo):
    res = as_role("SCHOOL_ADMIN").get(f"/api/v1/students/{student_with_photo.pk}/documents/")
    assert res.status_code == 200
    body = res.json()
    rows = body["data"] if isinstance(body, dict) and "data" in body else body
    assert [r["category"] for r in rows] == ["STUDENT_PHOTO"]
    assert rows[0]["file"]["original_name"] == "foto.png"


def test_unrelated_guardian_cannot_list_documents(as_role, student_with_photo):
    res = as_role("GUARDIAN").get(f"/api/v1/students/{student_with_photo.pk}/documents/")
    assert res.status_code in (403, 404)


def test_student_card_qr_is_svg_and_scoped(as_role, student_with_photo):
    res = as_role("SCHOOL_ADMIN").get(f"/api/v1/students/{student_with_photo.pk}/qr/")
    assert res.status_code == 200 and res["Content-Type"] == "image/svg+xml"
    assert b"<svg" in res.content
    assert as_role("GUARDIAN").get(f"/api/v1/students/{student_with_photo.pk}/qr/").status_code in (403, 404)


def test_list_filters_by_explicit_ids(as_role, student_with_photo):
    res = as_role("SCHOOL_ADMIN").get(f"/api/v1/students/?ids={student_with_photo.pk}&status=")
    assert [r["id"] for r in res.json()["data"]] == [str(student_with_photo.pk)]

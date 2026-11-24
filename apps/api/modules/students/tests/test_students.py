"""PRD §17.5 student tests + scope (§7.2, INV-06..08, INV-17)."""

from datetime import date

import pytest
from django.db import IntegrityError, transaction

from common.api.exceptions import DomainError
from modules.academics.tests.factories import make_assignment, make_class, make_offering, make_teacher, make_year
from modules.students import services
from modules.students.models import StudentEnrollment

pytestmark = pytest.mark.django_db


def _student(actor, classroom=None, name="Siswa Uji"):
    return services.create_student(
        actor=actor, data={"full_name": name, "birth_date": date(2010, 5, 5), "admission_date": date(2030, 1, 7)}, classroom=classroom
    )


@pytest.fixture
def setup(make_user):
    admin = make_user("tu", roles=["SCHOOL_ADMIN"])
    year = make_year()
    ipa1 = make_class(year, "X-IPA-1", "X", "IPA")
    ipa2 = make_class(year, "X-IPA-2", "X", "IPA")
    ips1 = make_class(year, "X-IPS-1", "X", "IPS")
    return admin, year, ipa1, ipa2, ips1


def test_student_no_generated_and_single_active_enrollment(setup):
    admin, year, ipa1, ipa2, _ = setup
    st = _student(admin, ipa1)
    assert st.student_no == "NOS-2030-0001"
    with pytest.raises(DomainError) as exc:
        services.enroll(actor=admin, student=st, classroom=ipa2)
    assert exc.value.error_code == "ENROLLMENT_DUPLICATE_ACTIVE"
    with pytest.raises(IntegrityError), transaction.atomic():
        StudentEnrollment.objects.create(
            student=st,
            academic_year=year,
            grade_level=ipa2.grade_level,
            major=ipa2.major,
            classroom=ipa2,
            start_date=date(2030, 2, 1),
            source="MANUAL",
        )


def test_enrollment_classroom_mismatch_rejected_by_model(setup):
    admin, year, ipa1, _, ips1 = setup
    st = _student(admin)
    enr = StudentEnrollment(
        student=st,
        academic_year=year,
        grade_level=ipa1.grade_level,
        major=ipa1.major,
        classroom=ips1,
        start_date=date(2030, 1, 7),
        source="MANUAL",
    )
    with pytest.raises(Exception):  # noqa: B017 - Django ValidationError from clean()
        enr.full_clean()


def test_class_move_preserves_history_and_major_change_needs_reason(setup, make_user):
    admin, year, ipa1, ipa2, ips1 = setup
    st = _student(admin, ipa1)
    services.transfer_internal(actor=admin, student=st, classroom=ipa2, effective_date=date(2030, 3, 1))
    hist = list(st.enrollments.order_by("start_date").values_list("classroom__code", "status"))
    assert hist == [("X-IPA-1", "TRANSFERRED"), ("X-IPA-2", "ACTIVE")]
    assert st.transfers.filter(transfer_type="INTERNAL_CLASS").exists()
    with pytest.raises(DomainError) as exc:
        services.transfer_internal(actor=admin, student=st, classroom=ips1)
    assert exc.value.error_code == "MAJOR_CHANGE_REASON_REQUIRED"
    services.transfer_internal(actor=admin, student=st, classroom=ips1, reason="Permintaan orang tua, disetujui kurikulum")
    t = st.transfers.get(transfer_type="INTERNAL_MAJOR")
    assert t.from_detail["major"] == "IPA" and t.to_detail["major"] == "IPS"


def test_graduated_student_cannot_be_enrolled(setup):
    admin, year, ipa1, ipa2, _ = setup
    st = _student(admin, ipa1)
    services.change_status(actor=admin, student=st, to_status="GRADUATED")
    assert st.enrollments.get().status == "COMPLETED"
    other = make_year(name="2031", start=date(2031, 1, 6), end=date(2031, 12, 5), trimesters=False)
    with pytest.raises(DomainError) as exc:
        services.enroll(actor=admin, student=st, classroom=make_class(other, "XI-IPA-1", "XI", "IPA"))
    assert exc.value.error_code == "INVALID_STATE_TRANSITION"


def test_transfer_out_requires_reason_and_closes_enrollment(setup):
    admin, _, ipa1, _, _ = setup
    st = _student(admin, ipa1)
    with pytest.raises(DomainError):
        services.change_status(actor=admin, student=st, to_status="TRANSFERRED")
    services.change_status(actor=admin, student=st, to_status="TRANSFERRED", reason="Pindah ke Díli", transfer={"destination": "ESG Díli"})
    assert st.enrollments.get().status == "TRANSFERRED"
    assert st.transfers.get().transfer_type == "OUT"
    assert st.status_history.count() == 2


def test_teacher_sees_only_assigned_class_students(setup, make_user):
    from rest_framework.test import APIClient

    admin, year, ipa1, ipa2, _ = setup
    a = _student(admin, ipa1, "Aluno A")
    b = _student(admin, ipa2, "Aluno B")
    teacher_user = make_user("guru", roles=["TEACHER"])
    make_assignment(make_teacher(user=teacher_user), ipa1, make_offering(year))
    api = APIClient()
    api.force_authenticate(teacher_user)
    names = [r["full_name"] for r in api.get("/api/v1/students/").json()["data"]]
    assert names == ["Aluno A"]
    assert api.get(f"/api/v1/students/{a.pk}/").status_code == 200
    detail = api.get(f"/api/v1/students/{a.pk}/").json()["data"]
    assert "address" not in detail and "phone" not in detail  # basic profile only for teachers
    assert api.get(f"/api/v1/students/{b.pk}/").status_code == 404


def test_guardian_cannot_access_unrelated_child(setup, make_user):
    from rest_framework.test import APIClient

    admin, _, ipa1, _, _ = setup
    own = _student(admin, ipa1, "Anak Sendiri")
    other = _student(admin, ipa1, "Anak Lain")
    gu = make_user("wali", roles=["GUARDIAN"])
    link = services.link_guardian(actor=admin, student=own, guardian_data={"full_name": "Wali"}, relationship="MOTHER", is_primary=True)
    link.guardian.user = gu
    link.guardian.save()
    api = APIClient()
    api.force_authenticate(gu)
    assert api.get(f"/api/v1/students/{own.pk}/").status_code == 200
    assert api.get(f"/api/v1/students/{other.pk}/").status_code == 404
    assert api.get("/api/v1/students/").status_code == 403  # directory is staff-only
    children = api.get(f"/api/v1/guardians/{link.guardian.pk}/children/").json()["data"]
    assert [c["full_name"] for c in children] == ["Anak Sendiri"]
    services.unlink_guardian(actor=admin, link=link)
    assert api.get(f"/api/v1/students/{own.pk}/").status_code == 404  # INV-17: inactive link = no access


def test_single_primary_guardian(setup):
    admin, _, ipa1, _, _ = setup
    st = _student(admin, ipa1)
    services.link_guardian(actor=admin, student=st, guardian_data={"full_name": "Ayah"}, relationship="FATHER", is_primary=True)
    services.link_guardian(actor=admin, student=st, guardian_data={"full_name": "Ibu"}, relationship="MOTHER", is_primary=True)
    assert st.guardian_links.filter(active=True, is_primary=True).get().guardian.full_name == "Ibu"


def test_student_api_create_and_permissions(as_role, setup):
    _, year, ipa1, _, _ = setup
    api = as_role("SCHOOL_ADMIN")
    r = api.post("/api/v1/students/", {"full_name": "Baru", "birth_date": "2011-02-02", "classroom": str(ipa1.pk)}, format="json")
    assert r.status_code == 201, r.content
    assert r.json()["data"]["current_enrollment"]["classroom_name"] == ipa1.name
    assert (
        as_role("FINANCE_ADMIN").post("/api/v1/students/", {"full_name": "X", "birth_date": "2011-02-02"}, format="json").status_code == 403
    )
    csv = api.get("/api/v1/students/export/")
    assert csv.status_code == 200 and b"student_no" in csv.content


def test_class_president_must_be_active_member_and_directory_views(setup, as_role):
    from django.core.exceptions import ValidationError

    admin, year, ipa1, ipa2, _ = setup
    member = _student(admin, ipa1, name="Ketua Kelas")
    outsider = _student(admin, ipa2, name="Bukan Anggota")
    ipa1.class_president = outsider
    with pytest.raises(ValidationError):
        ipa1.full_clean()
    ipa1.class_president = member
    ipa1.full_clean()
    ipa1.save()
    services.change_status(actor=admin, student=outsider, to_status="LEFT", reason="Pindah kota")

    api = as_role("SCHOOL_ADMIN")
    presidents = api.get("/api/v1/students/?view=president").json()["data"]
    assert [r["full_name"] for r in presidents] == ["Ketua Kelas"]
    archived = api.get("/api/v1/students/?view=archive").json()["data"]
    assert [r["full_name"] for r in archived] == ["Bukan Anggota"]
    assert api.get("/api/v1/students/?view=scholarship").status_code == 200
    assert as_role("TEACHER").get("/api/v1/students/?view=scholarship").status_code in (403, 404)

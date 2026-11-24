"""PRD §16.5 admissions tests."""

from datetime import date, timedelta

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework.test import APIClient

from common.api.exceptions import DomainError
from modules.academics.tests.factories import make_class, make_year
from modules.admissions import services
from modules.admissions.models import AdmissionPeriod, Applicant
from modules.audit.models import AuditLog
from modules.documents import services as files
from modules.students.models import Guardian, Student

pytestmark = pytest.mark.django_db
PDF = b"%PDF-1.4\n%%EOF\n"
PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 32


@pytest.fixture
def period(make_user):
    officer = make_user("ppdb", roles=["ADMISSION_OFFICER"])
    year = make_year()
    now = timezone.now()
    p = AdmissionPeriod.objects.create(
        academic_year=year,
        name="PPDB",
        registration_start=now - timedelta(days=1),
        registration_end=now + timedelta(days=10),
        required_documents=["BIRTH_CERTIFICATE", "ID_PHOTO"],
    )
    services.period_transition(actor=officer, period=p, action="open")
    return p, officer


def _public():
    c = APIClient(enforce_csrf_checks=True)
    token = c.get("/api/v1/auth/csrf/").json()["data"]["csrf_token"]
    c.credentials(HTTP_X_CSRFTOKEN=token)
    return c


def _applicant(period, officer, **data):
    a, _ = services.create_applicant(
        actor=officer,
        period=period,
        data={"full_name": "Calon", "birth_date": date(2011, 1, 1), **data},
        guardians=[{"full_name": "Wali", "relationship": "FATHER", "phone": "+670 7712 3456", "is_primary": True}],
    )
    return a


def _with_docs(a, officer):
    for t in ("BIRTH_CERTIFICATE", "ID_PHOTO"):
        services.add_document(
            actor=officer,
            applicant=a,
            document_type=t,
            file=files.store_bytes(PDF if t != "ID_PHOTO" else PNG, original_name="x", purpose="ADMISSION_DOCUMENT"),
        )
    return a


def test_public_flow_create_upload_submit_and_status(period):
    p, _ = period
    c = _public()
    r = c.post(
        "/api/v1/admissions/public/applicants/",
        {
            "admission_period": str(p.pk),
            "full_name": "Ana Calon",
            "birth_date": "2011-03-04",
            "guardians": [{"full_name": "Pai", "relationship": "FATHER", "phone": "+670 7711 2233"}],
        },
        format="json",
    )
    assert r.status_code == 201, r.content
    reg, token = r.json()["data"]["registration_no"], r.json()["data"]["access_token"]
    assert reg.startswith("PPDB-2030-") and len(reg) == len("PPDB-2030-") + 6
    c.credentials(HTTP_X_CSRFTOKEN=c.cookies["csrftoken"].value, HTTP_X_APPLICANT_TOKEN=token)
    early = c.post(f"/api/v1/admissions/public/applicants/{reg}/submit/")
    assert early.status_code == 400 and "documents" in early.json()["error"]["fields"]
    for t, data in (("BIRTH_CERTIFICATE", PDF), ("ID_PHOTO", PNG)):
        up = c.post(
            f"/api/v1/admissions/public/applicants/{reg}/documents/",
            {"document_type": t, "file": SimpleUploadedFile("f.bin", data)},
            format="multipart",
        )
        assert up.status_code == 201, up.content
    assert c.post(f"/api/v1/admissions/public/applicants/{reg}/submit/").json()["data"]["status"] == "SUBMITTED"
    assert c.patch(f"/api/v1/admissions/public/applicants/{reg}/", {"full_name": "Ganti"}, format="json").status_code == 409
    st = c.post("/api/v1/admissions/public/status/", {"registration_no": reg, "birth_date": "2011-03-04"}, format="json").json()["data"]
    assert st["status"] == "SUBMITTED"


def test_public_access_requires_token_and_status_not_enumerable(period):
    p, officer = period
    a = _applicant(p, officer)
    c = _public()
    assert c.get(f"/api/v1/admissions/public/applicants/{a.registration_no}/").status_code == 404
    c.credentials(HTTP_X_CSRFTOKEN=c.cookies["csrftoken"].value, HTTP_X_APPLICANT_TOKEN="wrong")
    assert c.get(f"/api/v1/admissions/public/applicants/{a.registration_no}/").status_code == 404
    wrong_dob = c.post(
        "/api/v1/admissions/public/status/", {"registration_no": a.registration_no, "birth_date": "2011-01-02"}, format="json"
    )
    assert wrong_dob.status_code == 404


def test_cannot_submit_outside_registration_window(period):
    p, officer = period
    a = _with_docs(_applicant(p, officer), officer)
    AdmissionPeriod.objects.filter(pk=p.pk).update(registration_end=timezone.now() - timedelta(minutes=1))
    with pytest.raises(DomainError):
        services.submit(actor=None, applicant=a, public=True)
    c = _public()
    r = c.post(
        "/api/v1/admissions/public/applicants/",
        {"admission_period": str(p.pk), "full_name": "X", "birth_date": "2011-01-01"},
        format="json",
    )
    assert r.status_code == 409


def test_registration_numbers_unique_under_many_creates(period):
    p, officer = period
    regs = {_applicant(p, officer).registration_no for _ in range(40)}
    assert len(regs) == 40


def test_missing_or_invalid_required_document_blocks_verified(period):
    p, officer = period
    a = _with_docs(_applicant(p, officer), officer)
    services.submit(actor=officer, applicant=a)
    with pytest.raises(DomainError):
        services.verify(actor=officer, applicant=a)  # still PENDING
    docs = list(a.documents.filter(active=True))
    services.verify_document(actor=officer, document=docs[0], status="VALID")
    services.verify_document(actor=officer, document=docs[1], status="INVALID", note="Buram")
    with pytest.raises(DomainError):
        services.verify(actor=officer, applicant=a)
    # Applicant may replace the INVALID document after submission.
    services.add_document(
        actor=None,
        applicant=a,
        document_type=docs[1].document_type,
        file=files.store_bytes(PNG, original_name="ulang.png", purpose="ADMISSION_DOCUMENT"),
        public=True,
    )
    new = a.documents.get(active=True, document_type=docs[1].document_type)
    services.verify_document(actor=officer, document=new, status="VALID")
    assert services.verify(actor=officer, applicant=a).status == "VERIFIED"


def _accepted(p, officer, make_user, decision="ACCEPTED"):
    principal = make_user(f"dir{Applicant.objects.count()}", roles=["PRINCIPAL"])
    a = _with_docs(_applicant(p, officer), officer)
    services.submit(actor=officer, applicant=a)
    for d in a.documents.filter(active=True):
        services.verify_document(actor=officer, document=d, status="VALID")
    services.verify(actor=officer, applicant=a)
    services.mark_eligible(actor=officer, applicant=a)
    services.decide(actor=principal, applicant=a, decision=decision, score=80, rank=1, note="catatan")
    return a


def test_decision_is_audited_and_rejected_cannot_enroll(period, make_user):
    p, officer = period
    a = _accepted(p, officer, make_user, decision="REJECTED")
    assert AuditLog.objects.filter(event_type="ADMISSION_DECISION_CHANGED", resource_id=str(a.pk)).exists()
    cls = make_class(p.academic_year, "X-IPA-9", "X", "IPA")
    with pytest.raises(DomainError):
        services.enroll(actor=officer, applicant=a, classroom=cls)
    assert not Student.objects.exists()


def test_enrollment_atomic_idempotent_and_no_partial_records(period, make_user):
    p, officer = period
    a = _accepted(p, officer, make_user)
    services.re_register(actor=officer, applicant=a)
    other_year_class = make_class(make_year(name="2031", start=date(2031, 1, 6), end=date(2031, 12, 5), trimesters=False), "X-IPA-1")
    with pytest.raises(DomainError):
        services.enroll(actor=officer, applicant=a, classroom=other_year_class)
    assert not Student.objects.exists() and not Guardian.objects.exists()  # rollback left nothing behind
    cls = make_class(p.academic_year, "X-IPA-1", "X", "IPA")
    student, created = services.enroll(actor=officer, applicant=a, classroom=cls)
    assert created and student.enrollments.get().source == "ADMISSION"
    assert student.guardian_links.get().is_primary
    again, created_again = services.enroll(actor=officer, applicant=a, classroom=cls)
    assert again.pk == student.pk and not created_again
    assert Student.objects.count() == 1 and Guardian.objects.count() == 1


def test_enroll_links_existing_guardian_only_when_explicit(period, make_user):
    p, officer = period
    existing = Guardian.objects.create(full_name="Wali")  # same name as applicant guardian
    a = _accepted(p, officer, make_user)
    services.re_register(actor=officer, applicant=a)
    cls = make_class(p.academic_year, "X-IPA-1", "X", "IPA")
    student, _ = services.enroll(actor=officer, applicant=a, classroom=cls)
    assert student.guardian_links.get().guardian_id != existing.pk  # never merged by name


def test_file_type_and_size_validation():
    with pytest.raises(DomainError) as exc:
        files.store_bytes(b"MZ\x90\x00 not a pdf", original_name="evil.pdf", purpose="ADMISSION_DOCUMENT")
    assert exc.value.error_code == "FILE_TYPE_NOT_ALLOWED"
    with pytest.raises(DomainError) as exc:
        files.store_bytes(b"%PDF-" + b"0" * (6 * 1024 * 1024), original_name="big.pdf", purpose="ADMISSION_DOCUMENT")
    assert exc.value.error_code == "FILE_TOO_LARGE"


def test_teacher_cannot_list_or_read_applicants(period, as_role):
    p, officer = period
    a = _applicant(p, officer)
    api = as_role("TEACHER")
    assert api.get("/api/v1/admissions/applicants/").status_code == 403
    assert api.get(f"/api/v1/admissions/applicants/{a.pk}/").status_code == 403
    doc = _with_docs(a, officer).documents.first()
    assert api.get(f"/api/v1/files/{doc.file_id}/download/").status_code == 404
    ok = as_role("ADMISSION_OFFICER").get(f"/api/v1/files/{doc.file_id}/download/")
    assert ok.status_code == 200 and AuditLog.objects.filter(event_type="DOCUMENT_DOWNLOADED_SENSITIVE").exists()

"""PRD §28.5 library tests + F11 asset exit criteria."""

import threading
from datetime import date

import pytest
from django.db import connection
from django.utils import timezone
from rest_framework.test import APIClient

from common.api.exceptions import DomainError
from modules.academics.models import Room
from modules.academics.tests.factories import make_class, make_teacher, make_year
from modules.assets import services as assets
from modules.assets.models import Asset
from modules.audit.models import AuditLog
from modules.library import services
from modules.library.models import LibraryBook, LibraryCopy, LibraryLoan
from modules.students import services as students

pytestmark = pytest.mark.django_db


def _api(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


@pytest.fixture
def ctx(make_user):
    lib = make_user("lib", roles=["LIBRARIAN"])
    admin = make_user("adm", roles=["SCHOOL_ADMIN"])
    year = make_year()
    cls = make_class(year)
    kids = [
        students.create_student(
            actor=admin, data={"full_name": f"S{i}", "birth_date": date(2014, 1, 1 + i), "admission_date": year.start_date}, classroom=cls
        )
        for i in range(2)
    ]
    book = LibraryBook.objects.create(title="Matemátika 10")
    copy = LibraryCopy.objects.create(book=book, barcode="B-0001")
    return {"lib": lib, "admin": admin, "kids": kids, "book": book, "copy": copy}


def test_withdrawn_copy_cannot_be_loaned(ctx):
    services.set_copy_status(actor=ctx["lib"], copy=ctx["copy"], status="WITHDRAWN")
    with pytest.raises(DomainError) as exc:
        services.checkout(actor=ctx["lib"], copy=ctx["copy"], student=ctx["kids"][0])
    assert exc.value.error_code == "LIBRARY_COPY_UNAVAILABLE"


def test_double_return_rejected_without_duplicate_event(ctx):
    loan = services.checkout(actor=ctx["lib"], copy=ctx["copy"], student=ctx["kids"][0])
    services.return_loan(actor=ctx["lib"], loan=loan)
    n = AuditLog.objects.filter(event_type="LIBRARY_LOAN_CHANGED").count()
    with pytest.raises(DomainError) as exc:
        services.return_loan(actor=ctx["lib"], loan=loan)
    assert exc.value.error_code == "LIBRARY_LOAN_ALREADY_CLOSED"
    assert AuditLog.objects.filter(event_type="LIBRARY_LOAN_CHANGED").count() == n
    ctx["copy"].refresh_from_db()
    assert ctx["copy"].status == "AVAILABLE"


def test_due_date_is_school_local_end_of_day_and_renewal_limit(ctx):
    loan = services.checkout(actor=ctx["lib"], copy=ctx["copy"], student=ctx["kids"][0], days=7)
    local = timezone.localtime(loan.due_at)
    assert (local.hour, local.minute) == (23, 59)
    services.renew(actor=ctx["lib"], loan=loan)
    services.renew(actor=ctx["lib"], loan=loan)
    with pytest.raises(DomainError) as exc:
        services.renew(actor=ctx["lib"], loan=loan)
    assert exc.value.error_code == "LIBRARY_RENEWAL_LIMIT"


def test_student_sees_only_own_loans(ctx, make_user):
    u = make_user("siswa", roles=["STUDENT"])
    ctx["kids"][0].user = u
    ctx["kids"][0].save(update_fields=["user"])
    c2 = LibraryCopy.objects.create(book=ctx["book"], barcode="B-0002")
    services.checkout(actor=ctx["lib"], copy=ctx["copy"], student=ctx["kids"][0])
    services.checkout(actor=ctx["lib"], copy=c2, student=ctx["kids"][1])
    rows = _api(u).get("/api/v1/library/loans/").json()["data"]
    assert len(rows) == 1 and rows[0]["barcode"] == "B-0001"
    assert len(_api(ctx["lib"]).get("/api/v1/library/loans/").json()["data"]) == 2
    assert (
        _api(u).post("/api/v1/library/loans/", {"barcode": "B-0002", "student": str(ctx["kids"][0].pk)}, format="json").status_code == 403
    )


@pytest.mark.django_db(transaction=True)
def test_concurrent_checkout_single_open_loan(make_user):
    from modules.accounts.seeding import seed_roles_and_permissions

    seed_roles_and_permissions()
    lib = make_user("lib2", roles=["LIBRARIAN"])
    admin = make_user("adm2", roles=["SCHOOL_ADMIN"])
    year = make_year()
    cls = make_class(year)
    kids = [
        students.create_student(
            actor=admin, data={"full_name": f"K{i}", "birth_date": date(2014, 2, 1 + i), "admission_date": year.start_date}, classroom=cls
        )
        for i in range(2)
    ]
    copy = LibraryCopy.objects.create(book=LibraryBook.objects.create(title="T"), barcode="C-1")
    out = []

    def go(k):
        try:
            services.checkout(actor=lib, copy=copy, student=k)
            out.append("ok")
        except DomainError as e:
            out.append(e.error_code)
        finally:
            connection.close()

    ts = [threading.Thread(target=go, args=(k,)) for k in kids]
    for t in ts:
        t.start()
    for t in ts:
        t.join()
    assert sorted(out) == ["LIBRARY_COPY_UNAVAILABLE", "ok"]
    assert LibraryLoan.objects.filter(copy=copy, status="OPEN").count() == 1


def test_asset_single_active_assignment_and_retire_restore(make_user):
    actor = make_user("aset", roles=["ASSET_OFFICER"])
    t1, t2 = make_teacher("A"), make_teacher("B")
    room = Room.objects.create(code="R-1", name="Lab")
    a = Asset.objects.create(asset_no="AS-1", name="Laptop", category="IT")
    assets.assign(actor=actor, asset=a, target_type="TEACHER", teacher=t1)
    with pytest.raises(DomainError) as exc:
        assets.assign(actor=actor, asset=a, target_type="TEACHER", teacher=t2)
    assert exc.value.error_code == "ASSET_NOT_AVAILABLE"
    with pytest.raises(DomainError):
        assets.retire(actor=actor, asset=a, reason="rusak")  # must return first
    assets.return_assignment(actor=actor, asset=a, condition_after="FAIR")
    assets.start_maintenance(actor=actor, asset=a, description="Ganti baterai")
    a.refresh_from_db()
    assert a.status == "MAINTENANCE" and a.assignments.count() == 1  # history kept
    m = a.maintenance.get()
    assets.complete_maintenance(actor=actor, maintenance=m, cost="12.50")
    assets.transfer(actor=actor, asset=a, to_room=room)
    assets.retire(actor=actor, asset=a, reason="Usang")
    with pytest.raises(DomainError):
        assets.assign(actor=actor, asset=a, target_type="ROOM", room=room)
    assets.restore(actor=actor, asset=a, reason="Masih layak")
    a.refresh_from_db()
    assert a.status == "AVAILABLE" and a.movements.count() == 1

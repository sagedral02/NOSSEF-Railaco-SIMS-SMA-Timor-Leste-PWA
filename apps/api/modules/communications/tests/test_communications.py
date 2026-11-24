"""F12 exit criteria: guessed file ids denied, push carries no sensitive detail, retries never duplicate notifications."""

import json
import uuid
from datetime import date, timedelta
from unittest import mock

import pytest
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from modules.academics.tests.factories import make_class, make_year
from modules.communications import services
from modules.communications.models import Announcement, AnnouncementAudience, Notification, NotificationDelivery, PushSubscription
from modules.communications.tasks import deliver
from modules.documents import services as files
from modules.students import services as students
from modules.students.models import Guardian

pytestmark = pytest.mark.django_db


def _api(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


@pytest.fixture
def ctx(make_user):
    admin = make_user("adm", roles=["SCHOOL_ADMIN"])
    gu = make_user("wali", roles=["GUARDIAN"])
    su = make_user("siswa", roles=["STUDENT"])
    other_g = make_user("wali2", roles=["GUARDIAN"])
    year = make_year()
    c1, c2 = make_class(year, "X-IPA-1"), make_class(year, "X-IPS-1", major_code="IPS")
    kid = students.create_student(
        actor=admin, data={"full_name": "Anak", "birth_date": date(2014, 1, 1), "admission_date": year.start_date}, classroom=c1
    )
    kid.user = su
    kid.save(update_fields=["user"])
    other = students.create_student(
        actor=admin, data={"full_name": "Lain", "birth_date": date(2014, 1, 2), "admission_date": year.start_date}, classroom=c2
    )
    students.link_guardian(actor=admin, student=kid, guardian=Guardian.objects.create(full_name="W", user=gu), relationship="MOTHER")
    students.link_guardian(
        actor=admin, student=other, guardian=Guardian.objects.create(full_name="W2", user=other_g), relationship="FATHER"
    )
    return {"admin": admin, "gu": gu, "su": su, "other_g": other_g, "c1": c1, "c2": c2, "kid": kid}


def test_notification_dedup_on_retry(ctx):
    a = services.notify({ctx["gu"].pk}, type="x", title="t", body="b", dedup_key="k1")
    b = services.notify({ctx["gu"].pk}, type="x", title="t", body="b", dedup_key="k1")
    assert len(a) == 1 and b == []
    assert Notification.objects.filter(recipient=ctx["gu"]).count() == 1
    assert NotificationDelivery.objects.filter(channel="IN_APP").count() == 1


def test_draft_invisible_and_class_audience(ctx, django_capture_on_commit_callbacks):
    a = Announcement.objects.create(
        title="Rapat kelas X IPA",
        body="...",
        audience_type="CLASS",
        publish_at=timezone.now() - timedelta(minutes=1),
        created_by=ctx["admin"],
    )
    AnnouncementAudience.objects.create(announcement=a, classroom=ctx["c1"])
    assert _api(ctx["gu"]).get("/api/v1/announcements/feed/").json()["data"] == []  # draft
    with django_capture_on_commit_callbacks(execute=True):
        r = _api(ctx["admin"]).post(f"/api/v1/announcements/{a.pk}/publish/")
    assert r.status_code == 200 and r.json()["data"]["status"] == "PUBLISHED"
    assert [x["title"] for x in _api(ctx["gu"]).get("/api/v1/announcements/feed/").json()["data"]] == ["Rapat kelas X IPA"]
    assert _api(ctx["su"]).get("/api/v1/announcements/feed/").json()["data"]
    assert _api(ctx["other_g"]).get("/api/v1/announcements/feed/").json()["data"] == []
    assert Notification.objects.filter(type="announcement.published").count() == 2  # guardian + student, not other class
    assert _api(ctx["gu"]).get("/api/v1/notifications/unread-count/").json()["data"]["unread"] == 1


def test_scheduled_publish(ctx):
    a = Announcement.objects.create(
        title="Nanti", body=".", audience_type="ALL", publish_at=timezone.now() + timedelta(hours=1), created_by=ctx["admin"]
    )
    services.publish(actor=ctx["admin"], announcement=a)
    a.refresh_from_db()
    assert a.status == "SCHEDULED" and services.publish_due() == 0
    Announcement.objects.filter(pk=a.pk).update(publish_at=timezone.now() - timedelta(seconds=1))
    assert services.publish_due() == 1


def test_private_file_cannot_be_fetched_by_guessed_id(ctx):
    f = files.store_bytes(b"%PDF-1.4 test", original_name="x.pdf", purpose="STUDENT_DOCUMENT", uploaded_by=ctx["admin"], attached=True)
    assert _api(ctx["gu"]).get(f"/api/v1/files/{f.pk}/download/").status_code == 404
    assert _api(ctx["gu"]).get(f"/api/v1/files/{uuid.uuid4()}/download/").status_code == 404


@override_settings(VAPID_PRIVATE_KEY="test-key", VAPID_PUBLIC_KEY="pub")
def test_push_payload_has_no_sensitive_detail(ctx, settings):
    settings.FEATURE_FLAGS = {**settings.FEATURE_FLAGS, "ENABLE_WEB_PUSH": True}
    services.subscribe(user=ctx["gu"], endpoint="https://push.example/abc", p256dh="p", auth="a")
    sub = PushSubscription.objects.get()
    assert "push.example" not in sub.endpoint_encrypted  # encrypted at rest
    [n] = services.notify(
        {ctx["gu"].pk},
        type="report_card.published",
        title="Rapor telah terbit",
        body="Rapor trimestre tersedia di portal.",
        dedup_key="r1",
        push=True,
    )
    with mock.patch("pywebpush.webpush") as wp:
        deliver(str(n.pk))
    payload = json.loads(wp.call_args.kwargs["data"])
    assert set(payload) == {"title", "body", "url"} and "nilai" not in payload["body"].lower() and "$" not in payload["body"]
    assert n.deliveries.get(channel="PUSH").status == "SENT"
    deliver(str(n.pk))  # re-run is a no-op (no duplicate sends)
    assert wp.call_count == 1

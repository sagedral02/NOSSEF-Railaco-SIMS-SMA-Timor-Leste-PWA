"""Notification + announcement services (PRD §30.3). Domain state is committed first; notifications are created after
commit with deterministic dedup keys, and each channel has its own delivery row (retries never duplicate)."""

import base64
import hashlib
import json
import logging

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone

from common.api.exceptions import ConflictError, DomainError, ErrorCode
from modules.audit import services as audit
from modules.students.models import EnrollmentStatus, Student, StudentEnrollment, StudentGuardian

from .models import Announcement, Notification, NotificationDelivery, NotificationPreference, PushSubscription

logger = logging.getLogger(__name__)
User = get_user_model()
A = Announcement.Status
PORTAL_ROLES = {"STUDENT", "GUARDIAN"}


# ------------------------------------------------------------------ encryption at rest


def _fernet():
    from cryptography.fernet import Fernet

    key = (
        settings.FIELD_ENCRYPTION_KEY
        or base64.urlsafe_b64encode(hashlib.sha256(f"fernet:{settings.SECRET_KEY}".encode()).digest()).decode()
    )
    return Fernet(key.encode() if isinstance(key, str) else key)


def encrypt(value: str) -> str:
    return _fernet().encrypt(value.encode()).decode()


def decrypt(token: str) -> str:
    return _fernet().decrypt(token.encode()).decode()


# ------------------------------------------------------------------ recipients


def guardian_users(student_ids):
    return set(
        StudentGuardian.objects.filter(
            student_id__in=student_ids,
            active=True,
            receives_notifications=True,
            guardian__user__isnull=False,
            guardian__user__is_active=True,
        ).values_list("guardian__user_id", flat=True)
    )


def student_users(student_ids):
    return set(Student.objects.filter(pk__in=student_ids, user__isnull=False, user__is_active=True).values_list("user_id", flat=True))


def _students_for(aud):
    qs = Student.objects.filter(status="ACTIVE")
    enr = Q(enrollments__status=EnrollmentStatus.ACTIVE)
    if aud.student_id:
        return qs.filter(pk=aud.student_id)
    if aud.classroom_id:
        return qs.filter(enr, enrollments__classroom_id=aud.classroom_id)
    cond = enr
    if aud.grade_level_id:
        cond &= Q(enrollments__grade_level_id=aud.grade_level_id)
    if aud.major_id:
        cond &= Q(enrollments__major_id=aud.major_id)
    return qs.filter(cond).distinct()


def resolve_audience(a):
    """Set of user ids the announcement targets (PRD §30.1)."""
    active = User.objects.filter(is_active=True)
    if a.audience_type == "ALL":
        return set(active.values_list("pk", flat=True))
    if a.audience_type == "STAFF":
        from modules.accounts.models import Role

        staff_codes = list(Role.objects.exclude(code__in=PORTAL_ROLES).values_list("code", flat=True))
        return set(active.filter(user_roles__role__code__in=staff_codes, user_roles__revoked_at__isnull=True).values_list("pk", flat=True))
    if a.audience_type == "ROLE":
        codes = [x.role_code for x in a.audiences.all() if x.role_code]
        return set(active.filter(user_roles__role__code__in=codes, user_roles__revoked_at__isnull=True).values_list("pk", flat=True))
    out = set()
    for aud in a.audiences.all():
        ids = list(_students_for(aud).values_list("pk", flat=True))
        if a.audience_type != "GUARDIAN":
            out |= student_users(ids)
        if a.audience_type == "GUARDIAN" or aud.include_guardians:
            out |= guardian_users(ids)
    return out


def announcements_for(user):
    """Current announcements visible to `user` (published, not expired, audience includes user)."""
    now = timezone.now()
    qs = Announcement.objects.filter(status=A.PUBLISHED, publish_at__lte=now).filter(Q(expire_at__isnull=True) | Q(expire_at__gt=now))
    roles = (
        set(user.user_roles.filter(revoked_at__isnull=True).values_list("role__code", flat=True)) if hasattr(user, "user_roles") else set()
    )
    student_ids = set(Student.objects.filter(user=user).values_list("pk", flat=True))
    child_ids = set(StudentGuardian.objects.filter(guardian__user=user, active=True).values_list("student_id", flat=True))
    enr = {
        (e["classroom_id"], e["grade_level_id"], e["major_id"], e["student_id"])
        for e in StudentEnrollment.objects.filter(student_id__in=student_ids | child_ids, status=EnrollmentStatus.ACTIVE).values(
            "classroom_id", "grade_level_id", "major_id", "student_id"
        )
    }
    visible = []
    for a in qs.prefetch_related("audiences"):
        t = a.audience_type
        if t == "ALL" or (t == "STAFF" and not roles <= PORTAL_ROLES) or (t == "ROLE" and roles & {x.role_code for x in a.audiences.all()}):
            visible.append(a)
            continue
        for aud in a.audiences.all():
            for cls, grade, major, sid in enr:
                is_child = sid in child_ids
                if t == "GUARDIAN" and not is_child:
                    continue
                if t != "GUARDIAN" and is_child and not aud.include_guardians:
                    continue
                if (
                    (aud.student_id and aud.student_id == sid)
                    or (aud.classroom_id and aud.classroom_id == cls)
                    or (
                        not aud.student_id
                        and not aud.classroom_id
                        and (aud.grade_level_id in (None, grade))
                        and (aud.major_id in (None, major))
                        and (aud.grade_level_id or aud.major_id)
                    )
                ):
                    visible.append(a)
                    break
            else:
                continue
            break
    return visible


# ------------------------------------------------------------------ announcements


@transaction.atomic
def publish(*, actor, announcement):
    a = Announcement.objects.select_for_update().get(pk=announcement.pk)
    if a.status not in {A.DRAFT, A.SCHEDULED}:
        raise ConflictError(ErrorCode.INVALID_STATE_TRANSITION, f"Pengumuman berstatus {a.status}.")
    if a.audience_type not in {"ALL", "STAFF"} and not a.audiences.exists():
        raise DomainError(ErrorCode.VALIDATION_ERROR, "Data tidak valid.", fields={"audiences": ["Pilih penerima pengumuman."]})
    now = timezone.now()
    if a.publish_at > now:
        a.status = A.SCHEDULED
        a.save(update_fields=["status", "updated_at"])
    else:
        _go_live(a, now)
    audit.record("ANNOUNCEMENT_PUBLISHED", actor=actor, resource=a, after={"status": a.status, "audience": a.audience_type})
    return a


def _go_live(a, now):
    a.status, a.published_at = A.PUBLISHED, now
    a.save(update_fields=["status", "published_at", "updated_at"])
    aid = str(a.pk)
    transaction.on_commit(lambda: _fanout(aid))


def _fanout(announcement_id):
    from .tasks import fanout_announcement

    fanout_announcement.delay(announcement_id)


def publish_due():
    """Beat task body (F12-06): publish SCHEDULED announcements whose time has come."""
    n = 0
    for a in Announcement.objects.filter(status=A.SCHEDULED, publish_at__lte=timezone.now()):
        with transaction.atomic():
            locked = Announcement.objects.select_for_update().get(pk=a.pk)
            if locked.status == A.SCHEDULED:
                _go_live(locked, timezone.now())
                n += 1
    return n


@transaction.atomic
def archive(*, actor, announcement):
    a = Announcement.objects.select_for_update().get(pk=announcement.pk)
    a.status = A.ARCHIVED
    a.save(update_fields=["status", "updated_at"])
    audit.record("ANNOUNCEMENT_ARCHIVED", actor=actor, resource=a)
    return a


# ------------------------------------------------------------------ notifications


def notify(user_ids, *, type, title, body, target_url="", dedup_key=None, push=False, email=False):
    """Create one inbox notification per recipient (idempotent by dedup_key) and queue optional channels."""
    created = []
    flags = settings.FEATURE_FLAGS
    prefs = {(p.user_id): p for p in NotificationPreference.objects.filter(user_id__in=user_ids, event_type=type)}
    for uid in user_ids:
        try:
            with transaction.atomic():
                n = Notification.objects.create(
                    recipient_id=uid, type=type, title=title[:200], body=body, target_url=target_url[:300], dedup_key=dedup_key
                )
        except IntegrityError:
            continue  # same logical notification already exists (retry/duplicate event)
        NotificationDelivery.objects.create(notification=n, channel="IN_APP", status="SENT", attempt_count=1, sent_at=timezone.now())
        pref = prefs.get(uid)
        if push:
            ok = flags.get("ENABLE_WEB_PUSH") and settings.VAPID_PRIVATE_KEY and (pref is None or pref.push_enabled)
            NotificationDelivery.objects.create(notification=n, channel="PUSH", status="PENDING" if ok else "SKIPPED")
        if email:
            ok = flags.get("ENABLE_EMAIL") and (pref is not None and pref.email_enabled)
            NotificationDelivery.objects.create(notification=n, channel="EMAIL", status="PENDING" if ok else "SKIPPED")
        created.append(n)
    pending = [str(n.pk) for n in created if n.deliveries.filter(status="PENDING").exists()]
    if pending:
        from .tasks import deliver

        transaction.on_commit(lambda: [deliver.delay(nid) for nid in pending])
    return created


def mark_read(user, ids=None):
    qs = Notification.objects.filter(recipient=user, read_at__isnull=True)
    if ids is not None:
        qs = qs.filter(pk__in=ids)
    return qs.update(read_at=timezone.now())


# ------------------------------------------------------------------ push


@transaction.atomic
def subscribe(*, user, endpoint, p256dh, auth, user_agent=""):
    if not endpoint.startswith("https://"):
        raise DomainError(ErrorCode.VALIDATION_ERROR, "Data tidak valid.", fields={"endpoint": ["Endpoint push tidak valid."]})
    h = hashlib.sha256(endpoint.encode()).hexdigest()
    sub, _ = PushSubscription.objects.update_or_create(
        endpoint_hash=h,
        defaults={
            "user": user,
            "endpoint_encrypted": encrypt(endpoint),
            "p256dh_encrypted": encrypt(p256dh),
            "auth_encrypted": encrypt(auth),
            "user_agent": user_agent[:300],
            "active": True,
        },
    )
    return sub


def deliver_push(delivery):
    """Send one generic push (no sensitive detail, PRD §30.4). Permanent failures deactivate the subscription."""
    from pywebpush import WebPushException, webpush

    n = delivery.notification
    payload = json.dumps({"title": "NOSSEF", "body": n.title, "url": n.target_url or "/notifications"})
    sent = False
    for sub in PushSubscription.objects.filter(user=n.recipient, active=True):
        try:
            webpush(
                subscription_info={
                    "endpoint": decrypt(sub.endpoint_encrypted),
                    "keys": {"p256dh": decrypt(sub.p256dh_encrypted), "auth": decrypt(sub.auth_encrypted)},
                },
                data=payload,
                vapid_private_key=settings.VAPID_PRIVATE_KEY,
                vapid_claims={"sub": settings.VAPID_SUBJECT},
                timeout=10,
            )
            sub.last_success_at = timezone.now()
            sub.save(update_fields=["last_success_at", "updated_at"])
            sent = True
        except WebPushException as exc:
            code = getattr(getattr(exc, "response", None), "status_code", None)
            if code in (404, 410):
                sub.active = False
                sub.save(update_fields=["active", "updated_at"])
            else:
                raise
    return sent

"""Notification fan-out and channel delivery (PRD §30.3): retries with backoff, idempotent per delivery row."""

from celery import shared_task
from django.db import transaction
from django.utils import timezone


@shared_task(bind=True, autoretry_for=(OSError,), retry_backoff=True, max_retries=5)
def deliver(self, notification_id):
    from .models import NotificationDelivery
    from .services import deliver_push

    for row in NotificationDelivery.objects.filter(notification_id=notification_id, status="PENDING"):
        with transaction.atomic():
            d = NotificationDelivery.objects.select_for_update().select_related("notification__recipient").get(pk=row.pk)
            if d.status != "PENDING":
                continue  # another worker already handled it
            d.attempt_count += 1
            try:
                if d.channel == "PUSH":
                    d.status = "SENT" if deliver_push(d) else "SKIPPED"
                elif d.channel == "EMAIL":
                    from django.core.mail import send_mail

                    n = d.notification
                    if n.recipient.email:
                        send_mail(n.title, f"{n.body}\n\nBuka aplikasi NOSSEF untuk detail.", None, [n.recipient.email])
                        d.status = "SENT"
                    else:
                        d.status = "SKIPPED"
                d.sent_at = timezone.now() if d.status == "SENT" else None
            except Exception as exc:  # noqa: BLE001 - stored as a safe error code; retried by the next run
                d.status = "FAILED" if d.attempt_count >= 5 else "PENDING"
                d.last_error_code = type(exc).__name__[:100]
            d.save()
    return notification_id


@shared_task
def fanout_announcement(announcement_id):
    from .models import Announcement
    from .services import notify, resolve_audience

    a = Announcement.objects.filter(pk=announcement_id, status="PUBLISHED").first()
    if a is None:
        return 0
    users = resolve_audience(a)
    notify(
        users,
        type="announcement.published",
        title=a.title,
        body="Pengumuman baru dari sekolah.",
        target_url=f"/announcements?id={a.pk}",
        dedup_key=f"announcement:{a.pk}",
        push=a.priority != "NORMAL",
    )
    return len(users)


@shared_task
def publish_scheduled_announcements():
    from .services import publish_due

    return publish_due()


@shared_task
def notify_overdue_invoices():
    """Daily: one reminder per overdue invoice per day (dedup key includes the date)."""
    from modules.finance.models import Invoice

    from .services import guardian_users, notify, student_users

    today = timezone.localdate()
    n = 0
    for inv in Invoice.objects.filter(status__in=["UNPAID", "PARTIALLY_PAID"], due_date__lt=today).only("pk", "student_id", "invoice_no"):
        users = guardian_users([inv.student_id]) | student_users([inv.student_id])
        n += len(
            notify(
                users,
                type="finance.invoice.overdue",
                title="Tagihan lewat jatuh tempo",
                body=f"Tagihan {inv.invoice_no} belum lunas.",
                target_url="/my/finance",
                dedup_key=f"overdue:{inv.pk}:{today}",
                push=True,
            )
        )
    return n

from celery import shared_task


@shared_task
def mark_overdue_loans():
    from .services import refresh_overdue

    return refresh_overdue()

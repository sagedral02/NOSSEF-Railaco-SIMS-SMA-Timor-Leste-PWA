from celery import shared_task


@shared_task(acks_late=True)
def run_report_job(job_id):
    from .services import execute

    execute(job_id)
    return job_id


@shared_task
def expire_generated_exports():
    from .services import expire_old

    return expire_old()

from celery import shared_task


@shared_task(acks_late=True)
def run_import(job_id):
    from .services import execute

    execute(job_id)
    return job_id

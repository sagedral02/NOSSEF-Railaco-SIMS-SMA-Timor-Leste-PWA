"""Export files are readable only by the requester (scope was applied when the export was built)."""

from modules.documents.access import register

from .models import ReportJob


@register
def report_files(user, file):
    job = ReportJob.objects.filter(result_file=file).first()
    if job is None:
        return None
    return job.requested_by_id == user.pk

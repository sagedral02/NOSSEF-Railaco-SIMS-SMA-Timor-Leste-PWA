"""Import source/result files are readable by the job requester (or system.import holders)."""

from django.db.models import Q

from common.permissions import user_has_global
from modules.documents.access import register

from .models import ImportJob


@register
def import_files(user, file):
    job = ImportJob.objects.filter(Q(source_file=file) | Q(result_file=file)).first()
    if job is None:
        return None
    return job.requested_by_id == user.pk or user_has_global(user, "system.import")

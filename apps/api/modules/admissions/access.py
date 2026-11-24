"""Applicant documents are readable by admission staff only."""

from common.permissions import user_has_perm
from modules.documents.access import register

from .models import ApplicantDocument


@register
def admission_files(user, file):
    if not ApplicantDocument.objects.filter(file=file).exists():
        return None
    return user_has_perm(user, "admission.view")

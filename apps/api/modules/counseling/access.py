"""Counseling evidence is RESTRICTED: only counselors (global counseling.view) may read it."""

from common.permissions import user_has_global
from modules.documents.access import register

from .models import CounselingFollowUp


@register
def counseling_files(user, file):
    if not CounselingFollowUp.objects.filter(evidence_file=file).exists():
        return None
    return user_has_global(user, "counseling.view")

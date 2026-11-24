"""Announcement attachments are readable by anyone the announcement is visible to (or its managers)."""

from common.permissions import user_has_perm
from modules.documents.access import register

from .models import Announcement


@register
def announcement_files(user, file):
    a = Announcement.objects.filter(attachment=file).first()
    if a is None:
        return None
    if user_has_perm(user, "announcement.publish"):
        return True
    from .services import announcements_for

    return any(x.pk == a.pk for x in announcements_for(user))

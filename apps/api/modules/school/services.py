from django.db import transaction

from modules.audit import services as audit
from modules.audit.events import AuditEvent

from .models import SchoolProfile

EDITABLE_FIELDS = ("name", "code", "address", "municipality", "phone", "email", "timezone", "default_locale")
DEFAULT_NAME = "Escola Secundária Católica Nossa Senhora de Fátima (NOSSEF) Railaco"


def get_profile():
    profile = SchoolProfile.objects.first()
    if profile is None:
        profile, _ = SchoolProfile.objects.get_or_create(singleton=True, defaults={"name": DEFAULT_NAME})
    return profile


def _snapshot(profile):
    return {field: getattr(profile, field) for field in EDITABLE_FIELDS}


@transaction.atomic
def update_profile(*, actor, data):
    profile = SchoolProfile.objects.select_for_update().get(pk=get_profile().pk)
    before = _snapshot(profile)
    for field in EDITABLE_FIELDS:
        if field in data:
            setattr(profile, field, data[field])
    profile.full_clean()
    profile.save()
    b, a = audit.diff(before, _snapshot(profile))
    if a:
        audit.record(AuditEvent.SYSTEM_SETTING_CHANGED, actor=actor, resource=profile, before=b, after=a)
    return profile

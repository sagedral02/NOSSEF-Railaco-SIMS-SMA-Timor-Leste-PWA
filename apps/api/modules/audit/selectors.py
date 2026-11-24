from .models import AuditLog


def audit_logs(*, event_type=None, actor_id=None, resource_type=None, resource_id=None, date_from=None, date_to=None):
    qs = AuditLog.objects.select_related("actor")
    if event_type:
        qs = qs.filter(event_type=event_type)
    if actor_id:
        qs = qs.filter(actor_id=actor_id)
    if resource_type:
        qs = qs.filter(resource_type=resource_type)
    if resource_id:
        qs = qs.filter(resource_id=resource_id)
    if date_from:
        qs = qs.filter(created_at__date__gte=date_from)
    if date_to:
        qs = qs.filter(created_at__date__lte=date_to)
    return qs

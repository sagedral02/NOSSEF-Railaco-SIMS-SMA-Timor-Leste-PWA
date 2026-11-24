"""Read-only audit API (PRD §14: no endpoint may delete audit rows)."""

from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import serializers, viewsets

from common.api.pagination import FeedCursorPagination
from common.permissions import ActionPermission

from ..models import AuditLog
from ..selectors import audit_logs


class AuditLogSerializer(serializers.ModelSerializer):
    actor_username = serializers.CharField(source="actor.username", default=None, read_only=True)

    class Meta:
        model = AuditLog
        fields = (
            "id",
            "actor",
            "actor_username",
            "event_type",
            "resource_type",
            "resource_id",
            "request_id",
            "ip_address",
            "before",
            "after",
            "metadata",
            "created_at",
        )
        read_only_fields = fields


class FilterParams(serializers.Serializer):
    event_type = serializers.CharField(required=False)
    actor_id = serializers.UUIDField(required=False)
    resource_type = serializers.CharField(required=False)
    resource_id = serializers.CharField(required=False)
    date_from = serializers.DateField(required=False)
    date_to = serializers.DateField(required=False)


@extend_schema_view(
    list=extend_schema(
        tags=["audit"],
        parameters=[
            OpenApiParameter("event_type", str),
            OpenApiParameter("actor_id", str),
            OpenApiParameter("resource_type", str),
            OpenApiParameter("resource_id", str),
            OpenApiParameter("date_from", str),
            OpenApiParameter("date_to", str),
        ],
    ),
    retrieve=extend_schema(tags=["audit"]),
)
class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = AuditLogSerializer
    pagination_class = FeedCursorPagination
    permission_classes = [ActionPermission]
    required_permissions = {"list": "audit.view", "retrieve": "audit.view"}
    filter_backends = []

    def get_queryset(self):
        if self.action != "list":
            return AuditLog.objects.select_related("actor")
        params = FilterParams(data=self.request.query_params)
        params.is_valid(raise_exception=True)
        return audit_logs(**params.validated_data)

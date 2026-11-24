"""Import endpoints (PRD §32.2, §64 /imports): upload → preview/validation → confirm → result. Scope is enforced by each
importer's permission check; jobs are visible only to their requester (or system.import holders)."""

import uuid

from django.http import HttpResponse
from drf_spectacular.utils import OpenApiParameter, OpenApiTypes, extend_schema, extend_schema_field
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from common.api.exceptions import DomainError, ErrorCode
from common.permissions import ActionPermission, user_has_global

from .. import services
from ..framework import REGISTRY
from ..models import ImportJob


class RowErrorSerializer(serializers.Serializer):
    row_number = serializers.IntegerField()
    field_name = serializers.CharField()
    error_code = serializers.CharField()
    message = serializers.CharField()
    raw_value = serializers.CharField()


class ImportJobSerializer(serializers.ModelSerializer):
    row_errors = serializers.SerializerMethodField()
    source_name = serializers.CharField(source="source_file.original_name", read_only=True)

    class Meta:
        model = ImportJob
        fields = [
            "id",
            "import_type",
            "status",
            "params",
            "total_rows",
            "valid_rows",
            "invalid_rows",
            "preview",
            "result",
            "result_file",
            "source_name",
            "error_code",
            "row_errors",
            "created_at",
            "finished_at",
        ]

    @extend_schema_field(RowErrorSerializer(many=True))
    def get_row_errors(self, obj):
        return RowErrorSerializer(obj.row_errors.all()[:500], many=True).data


class ImportCreateSerializer(serializers.Serializer):
    import_type = serializers.CharField()
    file = serializers.FileField()
    params = serializers.JSONField(required=False)
    idempotency_key = serializers.CharField(required=False, max_length=100)


@extend_schema(tags=["imports"])
class ImportJobViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin, viewsets.GenericViewSet):
    serializer_class = ImportJobSerializer
    permission_classes = [ActionPermission]
    required_permissions = {"list": None, "retrieve": None, "create": None, "confirm": None}
    parser_classes = [MultiPartParser, JSONParser]
    queryset = ImportJob.objects.none()
    filter_backends = []

    def get_queryset(self):
        qs = ImportJob.objects.select_related("source_file").prefetch_related("row_errors")
        if not user_has_global(self.request.user, "system.import"):
            qs = qs.filter(requested_by=self.request.user)
        t = self.request.query_params.get("import_type")
        return qs.filter(import_type=t) if t else qs

    @extend_schema(request={"multipart/form-data": ImportCreateSerializer}, responses={201: ImportJobSerializer})
    def create(self, request, *args, **kwargs):
        ser = ImportCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        params = ser.validated_data.get("params") or {}
        if isinstance(params, str):
            import json

            params = json.loads(params or "{}")
        key = request.headers.get("Idempotency-Key") or ser.validated_data.get("idempotency_key") or str(uuid.uuid4())
        job, created = services.create_job(
            actor=request.user,
            import_type=ser.validated_data["import_type"],
            upload=ser.validated_data["file"],
            params=params,
            idempotency_key=key,
        )
        return Response(ImportJobSerializer(job).data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    @extend_schema(request=None, responses=ImportJobSerializer)
    @action(detail=True, methods=["post"])
    def confirm(self, request, pk=None):
        job = services.confirm(actor=request.user, job=self.get_object())
        job.refresh_from_db()
        return Response(ImportJobSerializer(job).data)


@extend_schema(
    tags=["imports"],
    parameters=[OpenApiParameter("import_type", str, required=True)],
    responses={(200, "application/octet-stream"): OpenApiTypes.BINARY},
)
class ImportTemplateView(APIView):
    """Download a pre-filled template; extra query params are importer params (e.g. teaching_assignment, trimester)."""

    def get(self, request):
        imp = REGISTRY.get(request.query_params.get("import_type", ""))
        if imp is None:
            raise DomainError(ErrorCode.VALIDATION_ERROR, "Data tidak valid.", fields={"import_type": ["Jenis impor tidak dikenal."]})
        params = imp.validate_params({k: v for k, v in request.query_params.items() if k != "import_type"})
        imp.check_permission(request.user, params)
        data, name = imp.template(params)
        resp = HttpResponse(data, content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        resp["Content-Disposition"] = f'attachment; filename="{name}"'
        resp["Cache-Control"] = "private, no-store"
        return resp

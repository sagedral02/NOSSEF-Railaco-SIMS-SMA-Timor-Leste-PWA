"""Authorized upload/download (PRD §31.3, §47 Files rows). Files stream through the API; no public URLs."""

from django.http import FileResponse
from drf_spectacular.utils import OpenApiTypes, extend_schema
from rest_framework import serializers, status
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from common.api.exceptions import DomainError, ErrorCode
from modules.audit import services as audit
from modules.audit.events import AuditEvent

from .. import access, services
from ..models import Classification, StoredFile


class StoredFileSerializer(serializers.ModelSerializer):
    class Meta:
        model = StoredFile
        fields = ("id", "original_name", "mime_type", "size_bytes", "sha256", "classification", "purpose", "created_at")
        read_only_fields = fields


class UploadSerializer(serializers.Serializer):
    file = serializers.FileField()
    purpose = serializers.ChoiceField(choices=sorted(services.UPLOADABLE))


class FileUploadView(APIView):
    """Upload to a temporary (unattached) private object; domain endpoints attach it by id."""

    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser]

    @extend_schema(tags=["files"], request={"multipart/form-data": UploadSerializer}, responses={201: StoredFileSerializer})
    def post(self, request):
        data = UploadSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        stored = services.store_upload(data.validated_data["file"], purpose=data.validated_data["purpose"], uploaded_by=request.user)
        return Response(StoredFileSerializer(stored).data, status=status.HTTP_201_CREATED)


def _get_readable(request, pk):
    file = StoredFile.objects.filter(pk=pk).first()
    if file is None or not access.can_read(request.user, file):
        # Same answer for "missing" and "not yours" so file ids cannot be probed.
        raise DomainError(ErrorCode.RESOURCE_NOT_FOUND, "File tidak ditemukan.", status_code=404)
    return file


class FileDetailView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(tags=["files"], responses={200: StoredFileSerializer})
    def get(self, request, pk):
        return Response(StoredFileSerializer(_get_readable(request, pk)).data)


class FileDownloadView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(tags=["files"], responses={(200, "application/octet-stream"): OpenApiTypes.BINARY})
    def get(self, request, pk):
        file = _get_readable(request, pk)
        if file.classification in {Classification.CONFIDENTIAL, Classification.RESTRICTED} and file.purpose != "GENERATED":
            audit.record(AuditEvent.DOCUMENT_DOWNLOADED_SENSITIVE, actor=request.user, resource=file, metadata={"purpose": file.purpose})
        inline = request.query_params.get("inline") == "1"
        response = FileResponse(
            services.open_file(file), content_type=file.mime_type, as_attachment=not inline, filename=file.original_name
        )
        response["Cache-Control"] = "private, no-store"
        response["X-Content-Type-Options"] = "nosniff"
        return response

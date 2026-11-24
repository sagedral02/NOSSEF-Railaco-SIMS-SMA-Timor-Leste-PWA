"""Report catalog, export jobs and role dashboard endpoints (PRD §33, §64 /reports, /dashboard)."""

from drf_spectacular.utils import extend_schema
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from common.api.exceptions import ScopeDenied
from common.permissions import ActionPermission

from .. import dashboard, services
from ..catalog import REPORTS, allowed
from ..models import ReportJob


class JobSerializer(serializers.ModelSerializer):
    title = serializers.SerializerMethodField()

    class Meta:
        model = ReportJob
        fields = (
            "id",
            "report_type",
            "title",
            "parameters",
            "format",
            "status",
            "progress_percent",
            "row_count",
            "result_file",
            "error_code",
            "created_at",
            "finished_at",
        )

    def get_title(self, obj) -> str:
        rep = REPORTS.get(obj.report_type)
        return rep.title if rep else obj.report_type


class JobCreateSerializer(serializers.Serializer):
    report_type = serializers.CharField()
    parameters = serializers.DictField(required=False)
    format = serializers.ChoiceField(choices=ReportJob.Format.choices, default="XLSX")


class CatalogView(APIView):
    @extend_schema(tags=["reports"], responses={200: dict})
    def get(self, request):
        return Response(
            [
                {"code": r.code, "title": r.title, "domain": r.domain, "params": list(r.params), "formats": list(r.formats), "pii": r.pii}
                for r in REPORTS.values()
                if allowed(request.user, r)
            ]
        )


@extend_schema(tags=["reports"])
class JobViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin, viewsets.GenericViewSet):
    serializer_class = JobSerializer
    queryset = ReportJob.objects.none()
    permission_classes = [ActionPermission]
    required_permissions = {"list": None, "retrieve": None, "create": None}
    filter_backends = []

    def get_queryset(self):
        return ReportJob.objects.filter(requested_by=self.request.user)

    def get_object(self):
        obj = self.get_queryset().filter(pk=self.kwargs["pk"]).first()
        if obj is None:
            raise ScopeDenied()
        return obj

    @extend_schema(request=JobCreateSerializer, responses={201: JobSerializer})
    def create(self, request):
        data = JobCreateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        job = services.create_job(actor=request.user, report_type=v["report_type"], parameters=v.get("parameters"), fmt=v["format"])
        job.refresh_from_db()
        return Response(JobSerializer(job).data, status=status.HTTP_201_CREATED)


class DashboardView(APIView):
    @extend_schema(tags=["reports"], responses={200: dict})
    def get(self, request):
        return Response(dashboard.build(request.user))


class JobMonitorView(APIView):
    """Background job monitor for /admin/jobs (PRD §64, `system.view_jobs`).

    Metadata only: import previews and report contents are never exposed here, and result files stay downloadable
    only by their requester (reports.access / integrations.access).
    """

    permission_classes = [ActionPermission]
    required_permissions = {"get": "system.view_jobs"}

    @extend_schema(tags=["reports"], responses={200: dict})
    def get(self, request):
        from modules.integrations.models import ImportJob

        status_filter = request.query_params.get("status") or ""
        kind = request.query_params.get("kind") or ""
        rows = []
        if kind in ("", "REPORT"):
            qs = ReportJob.objects.select_related("requested_by").order_by("-created_at")
            if status_filter:
                qs = qs.filter(status=status_filter)
            for j in qs[:100]:
                rep = REPORTS.get(j.report_type)
                rows.append(
                    _job_row(request.user, "REPORT", j, j.report_type, rep.title if rep else j.report_type, j.progress_percent, j.row_count)
                )
        if kind in ("", "IMPORT"):
            qs = ImportJob.objects.select_related("requested_by").order_by("-created_at")
            if status_filter:
                qs = qs.filter(status=status_filter)
            for j in qs[:100]:
                done = j.status in ("COMPLETED", "COMPLETED_WITH_ERRORS", "FAILED")
                rows.append(_job_row(request.user, "IMPORT", j, j.import_type, j.import_type, 100 if done else 0, j.total_rows))
        rows.sort(key=lambda r: r["created_at"], reverse=True)
        return Response(rows[:150])


def _job_row(user, kind, job, code, title, progress, rows):
    mine = job.requested_by_id == user.pk
    return {
        "kind": kind,
        "id": str(job.pk),
        "code": code,
        "title": title,
        "status": job.status,
        "progress_percent": progress,
        "row_count": rows,
        "requested_by": job.requested_by.username,
        "error_code": job.error_code,
        "created_at": job.created_at.isoformat(),
        "finished_at": job.finished_at.isoformat() if job.finished_at else None,
        "result_file": str(job.result_file_id) if mine and job.result_file_id else None,
    }

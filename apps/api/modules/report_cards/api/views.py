"""Report card, transcript and promotion endpoints (PRD §47 Report rows, §64 /reports/*, /promotion)."""

from django.db.models import Q
from django.http import FileResponse
from drf_spectacular.utils import OpenApiParameter, OpenApiTypes, extend_schema, extend_schema_view
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from common.api.exceptions import ConflictError, DomainError, ErrorCode, ScopeDenied
from common.permissions import ActionPermission, user_has_global, user_has_perm
from modules.academics.models import AcademicYear, ClassRoom, Major, Trimester
from modules.academics.selectors import homeroom_classroom_ids
from modules.documents import services as files
from modules.students.models import Student
from modules.students.selectors import students_visible_to

from .. import services
from ..models import ReportCard


class SubjectRowSerializer(serializers.Serializer):
    subject_code = serializers.CharField()
    subject_name = serializers.CharField()
    final_score = serializers.CharField()
    grade_label = serializers.CharField(allow_blank=True)
    cau_score = serializers.CharField(allow_null=True)


class ReportCardSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    student_no = serializers.CharField(source="student.student_no", read_only=True)
    classroom = serializers.CharField(source="enrollment.classroom.name", read_only=True)
    trimester_number = serializers.IntegerField(source="trimester.number", read_only=True)
    academic_year = serializers.CharField(source="trimester.academic_year.name", read_only=True)
    missing = serializers.SerializerMethodField()

    class Meta:
        model = ReportCard
        fields = (
            "id",
            "student",
            "student_name",
            "student_no",
            "classroom",
            "trimester",
            "trimester_number",
            "academic_year",
            "status",
            "homeroom_note",
            "attendance_summary",
            "snapshot",
            "published_at",
            "revision_no",
            "reopen_reason",
            "pdf_file",
            "missing",
        )
        read_only_fields = fields

    def get_missing(self, obj) -> list[str]:
        ready = self.context.get("readiness")
        return ready.get(obj.student_id, []) if ready is not None else []


class GenerateSerializer(serializers.Serializer):
    classroom = serializers.PrimaryKeyRelatedField(queryset=ClassRoom.objects.all())
    trimester = serializers.PrimaryKeyRelatedField(queryset=Trimester.objects.all())


class ReviewSerializer(serializers.Serializer):
    homeroom_note = serializers.CharField(allow_blank=True)


class PublishSerializer(serializers.Serializer):
    ids = serializers.ListField(child=serializers.UUIDField(), min_length=1, max_length=200)


class ReasonSerializer(serializers.Serializer):
    reason = serializers.CharField()


def visible_reports(user):
    qs = ReportCard.objects.select_related("student", "enrollment__classroom", "trimester__academic_year")
    if user_has_global(user, "report.view"):
        return qs
    cond = Q(enrollment__classroom_id__in=homeroom_classroom_ids(user)) if user_has_perm(user, "report.view") else Q(pk__in=[])
    portal = students_visible_to(user).filter(Q(user=user) | Q(guardian_links__guardian__user=user, guardian_links__active=True))
    cond |= Q(student__in=portal.values("pk"), status__in=["PUBLISHED", "REOPENED"])  # INV: portal only sees published snapshots
    return qs.filter(cond)


@extend_schema_view(
    list=extend_schema(parameters=[OpenApiParameter(p, str) for p in ("classroom_id", "trimester_id", "student_id", "status")])
)
@extend_schema(tags=["report-cards"])
class ReportCardViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    serializer_class = ReportCardSerializer
    queryset = ReportCard.objects.none()
    permission_classes = [ActionPermission]
    required_permissions = {
        "list": None,
        "retrieve": None,
        "download": None,
        "generate": "report.generate",
        "review": "report.generate",
        "publish": "report.publish",
        "publish_one": "report.publish",
        "reopen": "report.reopen",
        "readiness": "report.view",
    }
    filter_backends = []
    pagination_class = None

    def get_queryset(self):
        qs = visible_reports(self.request.user)
        p = self.request.query_params
        for param, f in (
            ("classroom_id", "enrollment__classroom_id"),
            ("trimester_id", "trimester_id"),
            ("student_id", "student_id"),
            ("status", "status"),
        ):
            if v := p.get(param):
                qs = qs.filter(**{f: v})
        if self.action == "list" and not p.get("status"):
            qs = qs.exclude(status="REOPENED") if not p.get("student_id") else qs
        return qs

    def get_object(self):
        obj = self.get_queryset().filter(pk=self.kwargs["pk"]).first()
        if obj is None:
            raise ScopeDenied()
        return obj

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        p = self.request.query_params
        if self.action == "list" and p.get("classroom_id") and p.get("trimester_id"):
            c = ClassRoom.objects.filter(pk=p["classroom_id"]).first()
            t = Trimester.objects.filter(pk=p["trimester_id"]).first()
            if c and t:
                ctx["readiness"] = services.readiness(c, t)
        return ctx

    @extend_schema(request=GenerateSerializer, responses={200: dict})
    @action(detail=False, methods=["post"])
    def generate(self, request):
        data = GenerateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        return Response(services.generate(actor=request.user, **data.validated_data))

    @extend_schema(parameters=[OpenApiParameter("classroom_id", str), OpenApiParameter("trimester_id", str)], responses={200: dict})
    @action(detail=False, methods=["get"])
    def readiness(self, request):
        c = ClassRoom.objects.filter(pk=request.query_params.get("classroom_id")).first()
        t = Trimester.objects.filter(pk=request.query_params.get("trimester_id")).first()
        if c is None or t is None:
            raise DomainError(
                ErrorCode.VALIDATION_ERROR, "Data tidak valid.", fields={"classroom_id": ["Wajib."], "trimester_id": ["Wajib."]}
            )
        ready = services.readiness(c, t)
        return Response(
            {
                "students": len(ready),
                "ready": sum(1 for v in ready.values() if not v),
                "missing": {str(k): v for k, v in ready.items() if v},
            }
        )

    @extend_schema(request=ReviewSerializer, responses={200: ReportCardSerializer})
    @action(detail=True, methods=["post"])
    def review(self, request, pk=None):
        data = ReviewSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        return Response(ReportCardSerializer(services.review(actor=request.user, report=self.get_object(), **data.validated_data)).data)

    @extend_schema(request=PublishSerializer, responses={200: dict})
    @action(detail=False, methods=["post"])
    def publish(self, request):
        data = PublishSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        reports = list(self.get_queryset().filter(pk__in=data.validated_data["ids"]))
        return Response(services.publish(actor=request.user, reports=reports))

    @extend_schema(request=None, responses={200: dict})
    @action(detail=True, methods=["post"], url_path="publish")
    def publish_one(self, request, pk=None):
        return Response(services.publish(actor=request.user, reports=[self.get_object()]))

    @extend_schema(request=ReasonSerializer, responses={200: ReportCardSerializer})
    @action(detail=True, methods=["post"])
    def reopen(self, request, pk=None):
        data = ReasonSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        return Response(
            ReportCardSerializer(services.reopen(actor=request.user, report=self.get_object(), reason=data.validated_data["reason"])).data
        )

    @extend_schema(responses={(200, "application/pdf"): OpenApiTypes.BINARY})
    @action(detail=True, methods=["get"])
    def download(self, request, pk=None):
        report = self.get_object()
        if report.status not in {"PUBLISHED", "REOPENED"}:
            raise ConflictError(ErrorCode.REPORT_NOT_READY, "Rapor belum terbit.")
        if report.pdf_file_id is None:
            from ..tasks import render_report_pdf

            render_report_pdf(str(report.pk))  # synchronous fallback when the worker has not rendered yet
            report.refresh_from_db()
        if report.pdf_file_id is None:
            raise ConflictError(ErrorCode.JOB_ALREADY_RUNNING, "PDF rapor sedang dibuat. Coba beberapa saat lagi.")
        resp = FileResponse(
            files.open_file(report.pdf_file),
            content_type="application/pdf",
            as_attachment=request.query_params.get("inline") != "1",
            filename=report.pdf_file.original_name,
        )
        resp["Cache-Control"] = "private, no-store"
        return resp


class TranscriptView(APIView):
    @extend_schema(tags=["report-cards"], responses={200: dict})
    def get(self, request, student_id):
        student = students_visible_to(request.user, "report.view").filter(pk=student_id).first()
        if student is None:
            raise ScopeDenied()
        portal = student.user_id == request.user.pk or student.guardian_links.filter(guardian__user=request.user, active=True).exists()
        if not portal and not user_has_perm(request.user, "report.view"):
            raise DomainError(ErrorCode.PERMISSION_DENIED, "Anda tidak memiliki izin untuk tindakan ini.", status_code=403)
        return Response(
            {
                "student_id": str(student.pk),
                "student_no": student.student_no,
                "full_name": student.full_name,
                "years": services.transcript(student),
            }
        )


class VerifyView(APIView):
    """Public-safe QR verification: confirms authenticity without exposing grades (PRD §23.1)."""

    authentication_classes = []
    permission_classes = [AllowAny]

    @extend_schema(tags=["report-cards"], responses={200: dict})
    def get(self, request, token):
        r = ReportCard.objects.filter(verification_token=token).select_related("trimester__academic_year").first()
        if r is None or r.status not in {"PUBLISHED", "REOPENED"}:
            raise ScopeDenied("Dokumen tidak ditemukan.")
        return Response(
            {
                "valid": r.status == "PUBLISHED",
                "superseded": r.status == "REOPENED",
                "school": r.snapshot.get("school_name"),
                "student_name": r.snapshot.get("student_name"),
                "student_no": r.snapshot.get("student_no"),
                "academic_year": r.trimester.academic_year.name,
                "trimester": r.trimester.number,
                "revision": r.revision_no,
                "published_at": r.published_at,
            }
        )


class PromotionDecisionInput(serializers.Serializer):
    student = serializers.PrimaryKeyRelatedField(queryset=Student.objects.all())
    decision = serializers.ChoiceField(choices=["PROMOTED", "REPEATED", "GRADUATED"])
    target_classroom = serializers.PrimaryKeyRelatedField(queryset=ClassRoom.objects.all(), required=False, allow_null=True)
    target_major = serializers.PrimaryKeyRelatedField(queryset=Major.objects.all(), required=False, allow_null=True)
    reason = serializers.CharField(required=False, allow_blank=True, default="")
    override_incomplete = serializers.BooleanField(default=False)


class PromotionExecuteSerializer(serializers.Serializer):
    academic_year = serializers.PrimaryKeyRelatedField(queryset=AcademicYear.objects.all())
    decisions = PromotionDecisionInput(many=True)


class PromotionPreviewView(APIView):
    @extend_schema(
        tags=["promotion"],
        parameters=[OpenApiParameter("academic_year_id", str), OpenApiParameter("classroom_id", str)],
        responses={200: dict},
    )
    def get(self, request):
        if not user_has_perm(request.user, "report.view"):
            raise DomainError(ErrorCode.PERMISSION_DENIED, "Anda tidak memiliki izin untuk tindakan ini.", status_code=403)
        year = AcademicYear.objects.filter(pk=request.query_params.get("academic_year_id")).first()
        if year is None:
            raise DomainError(ErrorCode.VALIDATION_ERROR, "Data tidak valid.", fields={"academic_year_id": ["Wajib."]})
        classroom = (
            ClassRoom.objects.filter(pk=request.query_params.get("classroom_id")).first()
            if request.query_params.get("classroom_id")
            else None
        )
        return Response(services.promotion_preview(year, classroom))


class PromotionExecuteView(APIView):
    @extend_schema(tags=["promotion"], request=PromotionExecuteSerializer, responses={200: dict})
    def post(self, request):
        data = PromotionExecuteSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        year = data.validated_data["academic_year"]
        results = []
        for d in data.validated_data["decisions"]:
            # Each student is its own transaction (PRD §17.3): one failure does not undo the others.
            try:
                decision, created = services.execute_promotion(
                    actor=request.user,
                    year=year,
                    student=d["student"],
                    decision=d["decision"],
                    target_classroom=d.get("target_classroom"),
                    target_major=d.get("target_major"),
                    reason=d["reason"],
                    override_incomplete=d["override_incomplete"],
                )
                results.append(
                    {"student_id": str(d["student"].pk), "result": "APPLIED" if created else "DUPLICATE", "decision": decision.decision}
                )
            except DomainError as exc:
                results.append({"student_id": str(d["student"].pk), "result": "REJECTED", "code": exc.error_code, "message": exc.message})
        return Response({"results": results}, status=status.HTTP_200_OK)

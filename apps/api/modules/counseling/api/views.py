"""BK/discipline endpoints (PRD §26, §47). Case lists never include narrative; detail reads are audited."""

from django.db.models import Q
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from common.api.exceptions import DomainError, ErrorCode, ScopeDenied
from common.permissions import ActionPermission, user_has_global, user_has_perm
from modules.accounts.models import User
from modules.documents.models import StoredFile
from modules.students.models import Student, StudentGuardian
from modules.students.selectors import students_visible_to

from .. import services
from ..models import CounselingCase, CounselingFollowUp, DisciplineIncident, GuardianContact


def _filter(qs, params, mapping):
    for param, f in mapping:
        if v := params.get(param):
            qs = qs.filter(**{f: v})
    return qs


# ---------------------------------------------------------------- counseling


class ContactSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source="created_by.username", read_only=True)

    class Meta:
        model = GuardianContact
        fields = ("id", "contacted_at", "channel", "summary", "created_by_name")


class FollowUpSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source="created_by.username", read_only=True)

    class Meta:
        model = CounselingFollowUp
        fields = ("id", "follow_up_at", "note", "next_action_at", "evidence_file", "created_by_name", "created_at")


class CaseListSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    student_no = serializers.CharField(source="student.student_no", read_only=True)
    counselor_name = serializers.CharField(source="assigned_counselor.username", read_only=True, default=None)

    class Meta:
        model = CounselingCase
        fields = (
            "id",
            "case_no",
            "student",
            "student_name",
            "student_no",
            "category",
            "severity",
            "summary",
            "status",
            "assigned_counselor",
            "counselor_name",
            "opened_at",
            "closed_at",
            "version",
        )


class CaseDetailSerializer(CaseListSerializer):
    follow_ups = FollowUpSerializer(many=True, read_only=True)
    guardian_contacts = ContactSerializer(many=True, read_only=True)

    class Meta(CaseListSerializer.Meta):
        fields = (*CaseListSerializer.Meta.fields, "details", "reopen_reason", "follow_ups", "guardian_contacts")


class CaseWriteSerializer(serializers.Serializer):
    student = serializers.PrimaryKeyRelatedField(queryset=Student.objects.all(), required=False)
    category = serializers.CharField(max_length=100, required=False)
    severity = serializers.ChoiceField(choices=["LOW", "MEDIUM", "HIGH", "CRITICAL"], required=False)
    summary = serializers.CharField(max_length=250, required=False)
    details = serializers.CharField(required=False, allow_blank=True)
    assigned_counselor = serializers.PrimaryKeyRelatedField(queryset=User.objects.all(), required=False, allow_null=True)
    expected_version = serializers.IntegerField(required=False)


class StatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=CounselingCase.Status.choices)
    reason = serializers.CharField(required=False, allow_blank=True, default="")


class FollowUpInput(serializers.Serializer):
    note = serializers.CharField()
    follow_up_at = serializers.DateTimeField(required=False)
    next_action_at = serializers.DateTimeField(required=False, allow_null=True)
    evidence_file = serializers.PrimaryKeyRelatedField(queryset=StoredFile.objects.all(), required=False, allow_null=True)


class ContactInput(serializers.Serializer):
    channel = serializers.ChoiceField(choices=GuardianContact.Channel.choices)
    summary = serializers.CharField(max_length=500)
    contacted_at = serializers.DateTimeField(required=False)


@extend_schema_view(list=extend_schema(parameters=[OpenApiParameter(p, str) for p in ("student_id", "status", "severity", "q")]))
@extend_schema(tags=["counseling"])
class CaseViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    queryset = CounselingCase.objects.none()
    permission_classes = [ActionPermission]
    required_permissions = {
        "list": "counseling.view",
        "retrieve": "counseling.view",
        "create": "counseling.manage",
        "partial_update": "counseling.manage",
        "set_status": ("counseling.manage", "counseling.reopen"),
        "follow_ups": "counseling.manage",
        "contacts": "counseling.manage",
    }
    http_method_names = ["get", "post", "patch"]
    filter_backends = []

    def get_serializer_class(self):
        return CaseDetailSerializer if self.action == "retrieve" else CaseListSerializer

    def get_queryset(self):
        qs = services.cases_visible_to(self.request.user).select_related("student", "assigned_counselor")
        p = self.request.query_params
        qs = _filter(qs, p, (("student_id", "student_id"), ("status", "status"), ("severity", "severity")))
        if q := p.get("q", "").strip():
            qs = qs.filter(Q(case_no__icontains=q) | Q(student__full_name__icontains=q) | Q(category__icontains=q))
        return qs

    def get_object(self):
        obj = self.get_queryset().filter(pk=self.kwargs["pk"]).first()
        if obj is None:
            raise ScopeDenied()
        return obj

    def retrieve(self, request, pk=None):
        case = services.read_case(actor=request.user, case=self.get_object())
        case = (
            CounselingCase.objects.prefetch_related("follow_ups__created_by", "guardian_contacts__created_by")
            .select_related("student", "assigned_counselor")
            .get(pk=case.pk)
        )
        return Response(CaseDetailSerializer(case).data)

    @extend_schema(request=CaseWriteSerializer, responses={201: CaseDetailSerializer})
    def create(self, request):
        data = CaseWriteSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        missing = [f for f in ("student", "category", "severity", "summary") if not v.get(f)]
        if missing:
            raise DomainError(ErrorCode.VALIDATION_ERROR, "Data tidak valid.", fields={f: ["Wajib."] for f in missing})
        case = services.open_case(
            actor=request.user,
            student=v["student"],
            category=v["category"],
            severity=v["severity"],
            summary=v["summary"],
            details=v.get("details", ""),
            assigned_counselor=v.get("assigned_counselor"),
        )
        return Response(CaseDetailSerializer(case).data, status=status.HTTP_201_CREATED)

    @extend_schema(request=CaseWriteSerializer, responses={200: CaseDetailSerializer})
    def partial_update(self, request, pk=None):
        data = CaseWriteSerializer(data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        v = dict(data.validated_data)
        expected = v.pop("expected_version", None)
        v.pop("student", None)
        case = services.update_case(actor=request.user, case=self.get_object(), data=v, expected_version=expected)
        return Response(CaseDetailSerializer(case).data)

    @extend_schema(request=StatusSerializer, responses={200: CaseListSerializer})
    @action(detail=True, methods=["post"], url_path="status")
    def set_status(self, request, pk=None):
        data = StatusSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        return Response(
            CaseListSerializer(
                services.change_status(
                    actor=request.user, case=self.get_object(), target=data.validated_data["status"], reason=data.validated_data["reason"]
                )
            ).data
        )

    @extend_schema(request=FollowUpInput, responses={201: FollowUpSerializer})
    @action(detail=True, methods=["post"], url_path="follow-ups")
    def follow_ups(self, request, pk=None):
        data = FollowUpInput(data=request.data)
        data.is_valid(raise_exception=True)
        f = services.add_follow_up(actor=request.user, case=self.get_object(), **data.validated_data)
        return Response(FollowUpSerializer(f).data, status=status.HTTP_201_CREATED)

    @extend_schema(request=ContactInput, responses={201: ContactSerializer})
    @action(detail=True, methods=["post"], url_path="guardian-contacts")
    def contacts(self, request, pk=None):
        data = ContactInput(data=request.data)
        data.is_valid(raise_exception=True)
        c = services.log_guardian_contact(actor=request.user, case=self.get_object(), **data.validated_data)
        return Response(ContactSerializer(c).data, status=status.HTTP_201_CREATED)


class SummaryView(APIView):
    @extend_schema(tags=["counseling"], responses={200: dict})
    def get(self, request):
        if not (user_has_perm(request.user, "counseling.view") or user_has_perm(request.user, "discipline.view")):
            raise DomainError(ErrorCode.PERMISSION_DENIED, "Anda tidak memiliki izin untuk tindakan ini.", status_code=403)
        return Response(services.summary(request.user))


# ---------------------------------------------------------------- discipline


class IncidentSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    student_no = serializers.CharField(source="student.student_no", read_only=True)
    reported_by_name = serializers.CharField(source="reported_by.username", read_only=True)
    referred_case_no = serializers.CharField(source="referred_case.case_no", read_only=True, default=None)
    guardian_contacts = ContactSerializer(many=True, read_only=True)
    can_manage = serializers.SerializerMethodField()

    class Meta:
        model = DisciplineIncident
        fields = (
            "id",
            "student",
            "student_name",
            "student_no",
            "occurred_at",
            "location",
            "category",
            "severity",
            "description",
            "reported_by_name",
            "action_type",
            "action_taken",
            "status",
            "void_reason",
            "referred_case",
            "referred_case_no",
            "guardian_notice",
            "guardian_notified_at",
            "guardian_contacts",
            "can_manage",
            "created_at",
        )
        read_only_fields = ("status", "void_reason", "referred_case", "guardian_notice", "guardian_notified_at")

    def get_can_manage(self, obj) -> bool:
        request = self.context.get("request")
        return bool(request and user_has_global(request.user, "discipline.manage"))


class ReasonSerializer(serializers.Serializer):
    reason = serializers.CharField()


class NoticeSerializer(serializers.Serializer):
    notice = serializers.CharField()


@extend_schema_view(
    list=extend_schema(parameters=[OpenApiParameter(p, str) for p in ("student_id", "status", "severity", "classroom_id", "q")])
)
@extend_schema(tags=["discipline"])
class IncidentViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    serializer_class = IncidentSerializer
    queryset = DisciplineIncident.objects.none()
    permission_classes = [ActionPermission]
    required_permissions = {
        "list": ("discipline.view", "discipline.manage"),
        "retrieve": ("discipline.view", "discipline.manage"),
        "create": "discipline.manage",
        "partial_update": "discipline.manage",
        "void": "discipline.manage",
        "refer": "counseling.manage",
        "notice": "discipline.manage",
        "contacts": "discipline.manage",
    }
    http_method_names = ["get", "post", "patch"]
    filter_backends = []

    def get_queryset(self):
        qs = (
            services.incidents_visible_to(self.request.user)
            .select_related("student", "reported_by", "referred_case")
            .prefetch_related("guardian_contacts__created_by")
        )
        p = self.request.query_params
        qs = _filter(qs, p, (("student_id", "student_id"), ("status", "status"), ("severity", "severity")))
        if v := p.get("classroom_id"):
            qs = qs.filter(student__enrollments__classroom_id=v, student__enrollments__status="ACTIVE")
        if q := p.get("q", "").strip():
            qs = qs.filter(Q(student__full_name__icontains=q) | Q(category__icontains=q) | Q(student__student_no__icontains=q))
        return qs

    def get_object(self):
        obj = self.get_queryset().filter(pk=self.kwargs["pk"]).first()
        if obj is None:
            raise ScopeDenied()
        return obj

    def create(self, request):
        data = IncidentSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v = dict(data.validated_data)
        inc = services.record_incident(actor=request.user, student=v.pop("student"), data=v)
        return Response(IncidentSerializer(inc).data, status=status.HTTP_201_CREATED)

    def partial_update(self, request, pk=None):
        inc = self.get_object()
        data = IncidentSerializer(inc, data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        v = dict(data.validated_data)
        v.pop("student", None)
        return Response(IncidentSerializer(services.update_incident(actor=request.user, incident=inc, data=v)).data)

    @extend_schema(request=ReasonSerializer, responses={200: IncidentSerializer})
    @action(detail=True, methods=["post"])
    def void(self, request, pk=None):
        data = ReasonSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        return Response(
            IncidentSerializer(
                services.void_incident(actor=request.user, incident=self.get_object(), reason=data.validated_data["reason"])
            ).data
        )

    @extend_schema(request=None, responses={200: CaseListSerializer})
    @action(detail=True, methods=["post"])
    def refer(self, request, pk=None):
        return Response(CaseListSerializer(services.refer_to_counseling(actor=request.user, incident=self.get_object())).data)

    @extend_schema(request=NoticeSerializer, responses={200: IncidentSerializer})
    @action(detail=True, methods=["post"])
    def notice(self, request, pk=None):
        data = NoticeSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        return Response(
            IncidentSerializer(
                services.publish_guardian_notice(actor=request.user, incident=self.get_object(), notice=data.validated_data["notice"])
            ).data
        )

    @extend_schema(request=ContactInput, responses={201: ContactSerializer})
    @action(detail=True, methods=["post"], url_path="guardian-contacts")
    def contacts(self, request, pk=None):
        data = ContactInput(data=request.data)
        data.is_valid(raise_exception=True)
        c = services.log_guardian_contact(actor=request.user, incident=self.get_object(), **data.validated_data)
        return Response(ContactSerializer(c).data, status=status.HTTP_201_CREATED)


class NoticesView(APIView):
    """Portal: only explicitly published notices for own/linked students (never description or internal notes)."""

    @extend_schema(tags=["discipline"], parameters=[OpenApiParameter("student_id", str)], responses={200: dict})
    def get(self, request):
        own = students_visible_to(request.user).filter(
            Q(user=request.user) | Q(pk__in=StudentGuardian.objects.filter(guardian__user=request.user, active=True).values("student_id"))
        )
        qs = (
            DisciplineIncident.objects.filter(student__in=own, guardian_notified_at__isnull=False)
            .exclude(status="VOID")
            .select_related("student")
        )
        if v := request.query_params.get("student_id"):
            qs = qs.filter(student_id=v)
        return Response(
            [
                {
                    "id": str(i.pk),
                    "student_id": str(i.student_id),
                    "student_name": i.student.full_name,
                    "occurred_at": i.occurred_at,
                    "category": i.category,
                    "notice": i.guardian_notice,
                    "notified_at": i.guardian_notified_at,
                }
                for i in qs.order_by("-guardian_notified_at")[:100]
            ]
        )

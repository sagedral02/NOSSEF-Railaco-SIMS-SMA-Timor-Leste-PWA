"""Extracurricular endpoints (PRD §27.3)."""

from django.db.models import Count, Q
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from common.api.crud import MasterDataViewSet, ModelCleanSerializer
from common.api.exceptions import ScopeDenied
from common.permissions import ActionPermission, user_has_global
from modules.students.models import Student
from modules.students.selectors import students_visible_to

from .. import services
from ..models import ExtracurricularActivity, ExtracurricularAttendance, ExtracurricularMembership


class ActivitySerializer(ModelCleanSerializer):
    advisor_name = serializers.CharField(source="advisor_teacher.full_name", read_only=True, default=None)
    members = serializers.IntegerField(read_only=True, default=0)
    waitlist = serializers.IntegerField(read_only=True, default=0)
    can_manage = serializers.SerializerMethodField()

    class Meta:
        model = ExtracurricularActivity
        fields = (
            "id",
            "academic_year",
            "name",
            "category",
            "description",
            "schedule_text",
            "advisor_teacher",
            "advisor_name",
            "capacity",
            "active",
            "members",
            "waitlist",
            "can_manage",
        )

    def get_can_manage(self, obj) -> bool:
        return services.can_manage(self.context["request"].user, obj)


class MembershipSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    student_no = serializers.CharField(source="student.student_no", read_only=True)
    activity_name = serializers.CharField(source="activity.name", read_only=True)

    class Meta:
        model = ExtracurricularMembership
        fields = (
            "id",
            "activity",
            "activity_name",
            "student",
            "student_name",
            "student_no",
            "joined_at",
            "left_at",
            "status",
            "role",
            "note",
        )


class AddMemberSerializer(serializers.Serializer):
    student = serializers.PrimaryKeyRelatedField(queryset=Student.objects.all())
    role = serializers.CharField(required=False, allow_blank=True, default="")


class MemberStatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=ExtracurricularMembership.Status.choices)
    note = serializers.CharField(required=False, allow_blank=True)


class AttendanceItem(serializers.Serializer):
    student = serializers.UUIDField()
    status = serializers.ChoiceField(choices=ExtracurricularAttendance.Status.choices)
    note = serializers.CharField(required=False, allow_blank=True, default="")


class AttendanceSerializer(serializers.Serializer):
    date = serializers.DateField()
    records = AttendanceItem(many=True)


@extend_schema_view(list=extend_schema(parameters=[OpenApiParameter(p, str) for p in ("academic_year_id", "active", "mine")]))
@extend_schema(tags=["extracurricular"])
class ActivityViewSet(MasterDataViewSet):
    serializer_class = ActivitySerializer
    queryset = ExtracurricularActivity.objects.none()
    view_permission = "extracurricular.view"
    manage_permission = "extracurricular.manage"
    extra_permissions = {"members": "extracurricular.view", "attendance": "extracurricular.view"}
    pagination_class = None
    filter_backends = []

    def get_queryset(self):
        qs = ExtracurricularActivity.objects.select_related("advisor_teacher").annotate(
            members=Count("memberships", filter=Q(memberships__status="ACTIVE")),
            waitlist=Count("memberships", filter=Q(memberships__status="WAITLIST")),
        )
        p = self.request.query_params
        if v := p.get("academic_year_id"):
            qs = qs.filter(academic_year_id=v)
        if v := p.get("active"):
            qs = qs.filter(active=v in {"true", "1"})
        if p.get("mine") in {"1", "true"}:
            from modules.academics.selectors import teacher_of

            t = teacher_of(self.request.user)
            qs = qs.filter(advisor_teacher=t) if t else qs.none()
        return qs

    def perform_destroy(self, instance):
        if instance.memberships.exists():
            from common.api.exceptions import ConflictError, ErrorCode

            raise ConflictError(ErrorCode.RESOURCE_IN_USE, "Kegiatan memiliki riwayat anggota; arsipkan (nonaktifkan) saja.")
        super().perform_destroy(instance)

    @extend_schema(request=AddMemberSerializer, responses={200: MembershipSerializer(many=True), 201: MembershipSerializer})
    @action(detail=True, methods=["get", "post"])
    def members(self, request, pk=None):
        activity = self.get_object()
        if request.method == "GET":
            qs = activity.memberships.select_related("student", "activity").order_by("status", "student__full_name")
            if not user_has_global(request.user, "extracurricular.view") and not services.can_manage(request.user, activity):
                qs = qs.filter(student__in=students_visible_to(request.user))
            return Response(MembershipSerializer(qs, many=True).data)
        data = AddMemberSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        m = services.add_member(actor=request.user, activity=activity, **data.validated_data)
        return Response(MembershipSerializer(m).data, status=status.HTTP_201_CREATED)

    @extend_schema(request=AttendanceSerializer, parameters=[OpenApiParameter("date", str)], responses={200: dict})
    @action(detail=True, methods=["get", "post"])
    def attendance(self, request, pk=None):
        activity = self.get_object()
        if request.method == "GET":
            d = request.query_params.get("date")
            qs = activity.attendance.filter(date=d) if d else activity.attendance.all()
            return Response(
                [{"student": str(a.student_id), "date": a.date, "status": a.status, "note": a.note} for a in qs.order_by("-date")[:2000]]
            )
        data = AttendanceSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        n = services.record_attendance(
            actor=request.user, activity=activity, date=data.validated_data["date"], records=data.validated_data["records"]
        )
        return Response({"saved": n})


@extend_schema_view(list=extend_schema(parameters=[OpenApiParameter(p, str) for p in ("student_id", "status")]))
@extend_schema(tags=["extracurricular"])
class MembershipViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """DELETE withdraws (keeps history) per §27.3; PATCH changes status/note."""

    serializer_class = MembershipSerializer
    queryset = ExtracurricularMembership.objects.none()
    permission_classes = [ActionPermission]
    required_permissions = {"list": None, "partial_update": "extracurricular.view", "destroy": "extracurricular.view"}
    http_method_names = ["get", "patch", "delete"]
    filter_backends = []
    pagination_class = None

    def get_queryset(self):
        qs = ExtracurricularMembership.objects.select_related("student", "activity")
        if not user_has_global(self.request.user, "extracurricular.view"):
            qs = qs.filter(student__in=students_visible_to(self.request.user))
        p = self.request.query_params
        if v := p.get("student_id"):
            qs = qs.filter(student_id=v)
        if v := p.get("status"):
            qs = qs.filter(status=v)
        return qs

    def _get(self, pk):
        m = ExtracurricularMembership.objects.select_related("activity").filter(pk=pk).first()
        if m is None:
            raise ScopeDenied()
        return m

    @extend_schema(request=MemberStatusSerializer, responses={200: MembershipSerializer})
    def partial_update(self, request, pk=None):
        data = MemberStatusSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        m = services.set_member_status(
            actor=request.user, membership=self._get(pk), target=data.validated_data["status"], note=data.validated_data.get("note")
        )
        return Response(MembershipSerializer(m).data)

    def destroy(self, request, pk=None):
        m = services.set_member_status(actor=request.user, membership=self._get(pk), target="WITHDRAWN")
        return Response(MembershipSerializer(m).data)

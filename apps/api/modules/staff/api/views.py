from django.db.models import Q
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import serializers

from common.api.crud import MasterDataViewSet, ModelCleanSerializer

from ..models import StaffProfile, Teacher


class TeacherSerializer(ModelCleanSerializer):
    username = serializers.CharField(source="user.username", read_only=True, default=None)

    class Meta:
        model = Teacher
        fields = (
            "id",
            "user",
            "username",
            "employee_no",
            "full_name",
            "gender",
            "phone",
            "email",
            "employment_status",
            "join_date",
            "leave_date",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "username", "created_at", "updated_at")


class StaffProfileSerializer(ModelCleanSerializer):
    username = serializers.CharField(source="user.username", read_only=True, default=None)

    class Meta:
        model = StaffProfile
        fields = (
            "id",
            "user",
            "username",
            "employee_no",
            "full_name",
            "position",
            "department",
            "employment_status",
            "phone",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "username", "created_at", "updated_at")


_params = [OpenApiParameter("q", str), OpenApiParameter("employment_status", str)]


def _search(qs, params, extra=()):
    if q := params.get("q", "").strip():
        cond = Q(full_name__icontains=q) | Q(employee_no__icontains=q)
        for f in extra:
            cond |= Q(**{f"{f}__icontains": q})
        qs = qs.filter(cond)
    if s := params.get("employment_status"):
        qs = qs.filter(employment_status=s)
    return qs


@extend_schema_view(list=extend_schema(parameters=_params))
@extend_schema(tags=["staff"])
class TeacherViewSet(MasterDataViewSet):
    serializer_class = TeacherSerializer
    view_permission = ("staff.view", "academic.view")
    manage_permission = "staff.manage"
    filter_backends = []

    def get_queryset(self):
        qs = Teacher.objects.select_related("user")
        return _search(qs, self.request.query_params) if self.action == "list" else qs


@extend_schema_view(list=extend_schema(parameters=[*_params, OpenApiParameter("department", str)]))
@extend_schema(tags=["staff"])
class StaffProfileViewSet(MasterDataViewSet):
    serializer_class = StaffProfileSerializer
    view_permission = "staff.view"
    manage_permission = "staff.manage"
    filter_backends = []

    def get_queryset(self):
        qs = StaffProfile.objects.select_related("user")
        if self.action != "list":
            return qs
        qs = _search(qs, self.request.query_params, extra=("position",))
        if d := self.request.query_params.get("department"):
            qs = qs.filter(department=d)
        return qs

"""Academic master-data endpoints (PRD §47 Academic rows)."""

from django.db.models import Count, Q
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework.decorators import action
from rest_framework.response import Response

from common.api.crud import MasterDataViewSet

from .. import services
from ..models import (
    AcademicYear,
    BellPeriod,
    ClassRoom,
    GradeLevel,
    Major,
    Room,
    SchoolCalendarEvent,
    Subject,
    SubjectOffering,
    TeachingAssignment,
    Trimester,
)
from ..selectors import apply_academic_filters
from . import serializers as s

# Reference data is readable by every staff role that works with classes; writes need the specific manage permission.
READ = (
    "academic.view",
    "schedule.view",
    "attendance.view",
    "assessment.view",
    "student.view",
    "report.view",
    "finance.view",
    "admission.view",
    "staff.view",
)
FILTER_PARAMS = [OpenApiParameter(p, str) for p in ("academic_year_id", "grade_level_id", "major_id", "classroom_id", "q", "active")]


def _active_filter(qs, params):
    if (v := params.get("active")) in {"true", "false"}:
        qs = qs.filter(active=v == "true")
    return qs


@extend_schema(tags=["academics"])
class AcademicYearViewSet(MasterDataViewSet):
    serializer_class = s.AcademicYearSerializer
    view_permission = READ
    manage_permission = "academic.manage_year"
    extra_permissions = {
        "activate": "academic.manage_year",
        "close": "academic.manage_year",
        "make_current": "academic.manage_year",
        "readiness": READ,
    }
    queryset = AcademicYear.objects.prefetch_related("trimesters")
    filter_backends = []
    pagination_class = None

    @extend_schema(request=None, responses={200: s.AcademicYearSerializer})
    @action(detail=True, methods=["post"])
    def activate(self, request, pk=None):
        year = services.activate_year(actor=request.user, year=self.get_object())
        return Response(s.AcademicYearSerializer(self.get_queryset().get(pk=year.pk)).data)

    @extend_schema(request=None, responses={200: s.AcademicYearSerializer})
    @action(detail=True, methods=["post"])
    def close(self, request, pk=None):
        year = services.close_year(actor=request.user, year=self.get_object())
        return Response(s.AcademicYearSerializer(self.get_queryset().get(pk=year.pk)).data)

    @extend_schema(request=None, responses={200: s.AcademicYearSerializer})
    @action(detail=True, methods=["post"], url_path="make-current")
    def make_current(self, request, pk=None):
        year = services.make_current(actor=request.user, year=self.get_object())
        return Response(s.AcademicYearSerializer(self.get_queryset().get(pk=year.pk)).data)

    @extend_schema(responses={200: s.ReadinessCheckSerializer(many=True)})
    @action(detail=True, methods=["get"])
    def readiness(self, request, pk=None):
        return Response(services.readiness(self.get_object()))


@extend_schema_view(list=extend_schema(parameters=[OpenApiParameter("academic_year_id", str)]))
@extend_schema(tags=["academics"])
class TrimesterViewSet(MasterDataViewSet):
    serializer_class = s.TrimesterSerializer
    view_permission = READ
    manage_permission = "academic.manage_trimester"
    extra_permissions = {"transition": "academic.manage_trimester"}
    filter_backends = []
    pagination_class = None

    def get_queryset(self):
        return apply_academic_filters(Trimester.objects.select_related("academic_year"), self.request.query_params)

    @extend_schema(request=s.TrimesterTransitionSerializer, responses={200: s.TrimesterSerializer})
    @action(detail=True, methods=["post"])
    def transition(self, request, pk=None):
        data = s.TrimesterTransitionSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        t = services.advance_trimester(actor=request.user, trimester=self.get_object(), target=data.validated_data["target"])
        return Response(s.TrimesterSerializer(t).data)


@extend_schema(tags=["academics"])
class GradeLevelViewSet(MasterDataViewSet):
    serializer_class = s.GradeLevelSerializer
    view_permission = READ
    manage_permission = "academic.manage_class"
    queryset = GradeLevel.objects.all()
    http_method_names = ["get", "patch"]
    filter_backends = []
    pagination_class = None


@extend_schema(tags=["academics"])
class MajorViewSet(MasterDataViewSet):
    serializer_class = s.MajorSerializer
    view_permission = READ
    manage_permission = "academic.manage_class"
    queryset = Major.objects.all()
    http_method_names = ["get", "patch"]
    filter_backends = []
    pagination_class = None


@extend_schema(tags=["academics"])
class RoomViewSet(MasterDataViewSet):
    serializer_class = s.RoomSerializer
    view_permission = (*READ, "asset.view")
    manage_permission = "academic.manage_class"
    filter_backends = []
    pagination_class = None

    def get_queryset(self):
        return _active_filter(Room.objects.all(), self.request.query_params)


@extend_schema(tags=["academics"])
class BellPeriodViewSet(MasterDataViewSet):
    serializer_class = s.BellPeriodSerializer
    view_permission = READ
    manage_permission = "academic.manage_class"
    filter_backends = []
    pagination_class = None

    def get_queryset(self):
        return _active_filter(BellPeriod.objects.all(), self.request.query_params)


@extend_schema_view(list=extend_schema(parameters=FILTER_PARAMS))
@extend_schema(tags=["academics"])
class CalendarEventViewSet(MasterDataViewSet):
    serializer_class = s.CalendarEventSerializer
    view_permission = None  # every authenticated user may read the school calendar
    manage_permission = "academic.manage_year"
    filter_backends = []

    def get_queryset(self):
        qs = apply_academic_filters(SchoolCalendarEvent.objects.all(), self.request.query_params)
        if d := self.request.query_params.get("date_from"):
            qs = qs.filter(end_at__gte=d)
        if d := self.request.query_params.get("date_to"):
            qs = qs.filter(start_at__lte=d)
        return qs


@extend_schema_view(list=extend_schema(parameters=FILTER_PARAMS))
@extend_schema(tags=["academics"])
class SubjectViewSet(MasterDataViewSet):
    serializer_class = s.SubjectSerializer
    view_permission = READ
    manage_permission = "academic.manage_subject"
    filter_backends = []
    pagination_class = None

    def get_queryset(self):
        qs = _active_filter(Subject.objects.all(), self.request.query_params)
        if q := self.request.query_params.get("q"):
            qs = qs.filter(name__icontains=q) | qs.filter(code__icontains=q)
        return qs


@extend_schema_view(list=extend_schema(parameters=FILTER_PARAMS))
@extend_schema(tags=["academics"])
class SubjectOfferingViewSet(MasterDataViewSet):
    serializer_class = s.SubjectOfferingSerializer
    view_permission = READ
    manage_permission = "academic.manage_subject"
    filter_backends = []
    pagination_class = None

    def get_queryset(self):
        qs = SubjectOffering.objects.select_related("subject", "grade_level", "major", "academic_year")
        return _active_filter(apply_academic_filters(qs, self.request.query_params), self.request.query_params)


@extend_schema_view(list=extend_schema(parameters=FILTER_PARAMS))
@extend_schema(tags=["academics"])
class ClassRoomViewSet(MasterDataViewSet):
    serializer_class = s.ClassRoomSerializer
    view_permission = READ
    manage_permission = "academic.manage_class"
    filter_backends = []
    pagination_class = None

    def get_queryset(self):
        qs = ClassRoom.objects.select_related(
            "grade_level", "major", "homeroom_teacher", "default_room", "academic_year", "class_president"
        ).annotate(active_student_count=Count("enrollments", filter=Q(enrollments__status="ACTIVE")))
        qs = _active_filter(apply_academic_filters(qs, self.request.query_params), self.request.query_params)
        if self.request.query_params.get("classroom_id"):
            qs = qs.filter(id=self.request.query_params["classroom_id"])
        return qs


@extend_schema_view(list=extend_schema(parameters=[*FILTER_PARAMS, OpenApiParameter("teacher_id", str)]))
@extend_schema(tags=["academics"])
class TeachingAssignmentViewSet(MasterDataViewSet):
    serializer_class = s.TeachingAssignmentSerializer
    view_permission = READ
    manage_permission = "academic.manage_class"
    filter_backends = []

    def get_queryset(self):
        qs = TeachingAssignment.objects.select_related("teacher", "classroom", "subject_offering__subject", "academic_year")
        qs = _active_filter(apply_academic_filters(qs, self.request.query_params), self.request.query_params)
        if t := self.request.query_params.get("teacher_id"):
            qs = qs.filter(teacher_id=t)
        return qs

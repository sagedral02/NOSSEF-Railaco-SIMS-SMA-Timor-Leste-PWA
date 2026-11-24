"""Schedule endpoints (PRD §47 Schedules rows, §19.3)."""

from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from common.api.exceptions import DomainError, ErrorCode, ScopeDenied
from common.permissions import ActionPermission, user_has_perm
from modules.academics.models import AcademicYear, BellPeriod, ClassRoom, Room, TeachingAssignment, Trimester
from modules.academics.selectors import teacher_of
from modules.staff.models import Teacher
from modules.students.models import EnrollmentStatus
from modules.students.selectors import students_visible_to

from .. import services
from ..models import ScheduleEntry, ScheduleException


class EntrySerializer(serializers.ModelSerializer):
    classroom_name = serializers.CharField(source="classroom.name", read_only=True)
    teacher_id = serializers.UUIDField(source="teaching_assignment.teacher_id", read_only=True)
    teacher_name = serializers.CharField(source="teaching_assignment.teacher.full_name", read_only=True)
    subject_code = serializers.CharField(source="teaching_assignment.subject_offering.subject.code", read_only=True)
    subject_name = serializers.CharField(source="teaching_assignment.subject_offering.subject.name", read_only=True)
    bell_period_name = serializers.CharField(source="bell_period.name", read_only=True)
    bell_sequence = serializers.IntegerField(source="bell_period.sequence", read_only=True)
    room_code = serializers.CharField(source="room.code", read_only=True, default=None)

    class Meta:
        model = ScheduleEntry
        fields = (
            "id",
            "academic_year",
            "trimester",
            "classroom",
            "classroom_name",
            "teaching_assignment",
            "teacher_id",
            "teacher_name",
            "subject_code",
            "subject_name",
            "weekday",
            "bell_period",
            "bell_period_name",
            "bell_sequence",
            "room",
            "room_code",
            "valid_from",
            "valid_until",
            "active",
        )
        read_only_fields = ("id",)


class EntryWriteSerializer(serializers.Serializer):
    academic_year = serializers.PrimaryKeyRelatedField(queryset=AcademicYear.objects.exclude(status="CLOSED"), required=False)
    trimester = serializers.PrimaryKeyRelatedField(queryset=Trimester.objects.all(), required=False, allow_null=True)
    classroom = serializers.PrimaryKeyRelatedField(queryset=ClassRoom.objects.all(), required=False)
    teaching_assignment = serializers.PrimaryKeyRelatedField(queryset=TeachingAssignment.objects.all())
    weekday = serializers.IntegerField(min_value=1, max_value=7)
    bell_period = serializers.PrimaryKeyRelatedField(queryset=BellPeriod.objects.filter(active=True))
    room = serializers.PrimaryKeyRelatedField(queryset=Room.objects.filter(active=True), required=False, allow_null=True)
    valid_from = serializers.DateField(required=False)
    valid_until = serializers.DateField(required=False, allow_null=True)
    active = serializers.BooleanField(required=False, default=True)

    def validate(self, attrs):
        ta = attrs["teaching_assignment"]
        attrs.setdefault("classroom", ta.classroom)
        attrs.setdefault("academic_year", ta.academic_year)
        attrs.setdefault("valid_from", max(ta.academic_year.start_date, min(timezone.localdate(), ta.academic_year.end_date)))
        if "room" not in attrs:
            attrs["room"] = attrs["classroom"].default_room
        return attrs


class EntryPatchSerializer(EntryWriteSerializer):
    teaching_assignment = serializers.PrimaryKeyRelatedField(queryset=TeachingAssignment.objects.all(), required=False)
    weekday = serializers.IntegerField(min_value=1, max_value=7, required=False)
    bell_period = serializers.PrimaryKeyRelatedField(queryset=BellPeriod.objects.filter(active=True), required=False)

    def validate(self, attrs):
        return attrs


class ExceptionSerializer(serializers.ModelSerializer):
    substitute_teacher_name = serializers.CharField(source="substitute_teacher.full_name", read_only=True, default=None)
    new_bell_period_name = serializers.CharField(source="new_bell_period.name", read_only=True, default=None)
    new_room_code = serializers.CharField(source="new_room.code", read_only=True, default=None)
    classroom_name = serializers.CharField(source="schedule_entry.classroom.name", read_only=True)
    subject_code = serializers.CharField(source="schedule_entry.teaching_assignment.subject_offering.subject.code", read_only=True)
    teacher_name = serializers.CharField(source="schedule_entry.teaching_assignment.teacher.full_name", read_only=True)

    class Meta:
        model = ScheduleException
        fields = (
            "id",
            "schedule_entry",
            "date",
            "exception_type",
            "new_bell_period",
            "new_bell_period_name",
            "new_room",
            "new_room_code",
            "substitute_teacher",
            "substitute_teacher_name",
            "reason",
            "classroom_name",
            "subject_code",
            "teacher_name",
            "created_at",
        )
        read_only_fields = ("id", "schedule_entry", "created_at")


class TimetableQuery(serializers.Serializer):
    date = serializers.DateField(required=False)
    classroom_id = serializers.UUIDField(required=False)
    teacher_id = serializers.UUIDField(required=False)
    student_id = serializers.UUIDField(required=False)
    mine = serializers.BooleanField(required=False, default=False)


SCHEDULE_PARAMS = [OpenApiParameter(p, str) for p in ("academic_year_id", "classroom_id", "teacher_id", "room_id", "weekday", "active")]


@extend_schema_view(list=extend_schema(parameters=SCHEDULE_PARAMS))
@extend_schema(tags=["schedules"])
class ScheduleViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    serializer_class = EntrySerializer
    permission_classes = [ActionPermission]
    required_permissions = {
        "list": "schedule.view",
        "retrieve": "schedule.view",
        "create": "schedule.manage",
        "partial_update": "schedule.manage",
        "exceptions": ("schedule.manage", "schedule.substitute"),
        "validate": "schedule.manage",
        "timetable": None,
    }
    filter_backends = []
    pagination_class = None
    http_method_names = ["get", "post", "patch"]
    queryset = ScheduleEntry.objects.none()

    def get_queryset(self):
        qs = ScheduleEntry.objects.select_related(
            "classroom", "bell_period", "room", "teaching_assignment__teacher", "teaching_assignment__subject_offering__subject"
        )
        p = self.request.query_params
        for param, field in (
            ("academic_year_id", "academic_year_id"),
            ("classroom_id", "classroom_id"),
            ("room_id", "room_id"),
            ("teacher_id", "teaching_assignment__teacher_id"),
            ("weekday", "weekday"),
        ):
            if v := p.get(param):
                qs = qs.filter(**{field: v})
        if p.get("active", "true") == "true":
            qs = qs.filter(active=True)
        return qs

    @extend_schema(request=EntryWriteSerializer, responses={201: EntrySerializer})
    def create(self, request):
        data = EntryWriteSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        entry = services.create_entry(actor=request.user, data=data.validated_data)
        return Response(EntrySerializer(entry).data, status=status.HTTP_201_CREATED)

    @extend_schema(request=EntryPatchSerializer, responses={200: EntrySerializer})
    def partial_update(self, request, pk=None):
        data = EntryPatchSerializer(data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        entry = services.update_entry(actor=request.user, entry=self.get_object(), data=data.validated_data)
        return Response(EntrySerializer(entry).data)

    @extend_schema(request=EntryWriteSerializer, responses={200: dict})
    @action(detail=False, methods=["post"])
    def validate(self, request):
        """Dry-run collision check (PRD §47 /schedules/validate/)."""
        data = EntryWriteSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        exclude = request.query_params.get("exclude_id")
        try:
            conflicts = services.validate_entry(data.validated_data, exclude_id=exclude)
        except DomainError as exc:
            return Response({"ok": False, "conflicts": [{"code": exc.error_code, "message": exc.message}]})
        return Response({"ok": not conflicts, "conflicts": conflicts})

    @extend_schema(methods=["post"], request=ExceptionSerializer, responses={201: ExceptionSerializer})
    @action(detail=True, methods=["post"])
    def exceptions(self, request, pk=None):
        entry = self.get_object()
        data = ExceptionSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        if data.validated_data["exception_type"] != "SUBSTITUTED" and not user_has_perm(request.user, "schedule.manage"):
            raise DomainError(ErrorCode.PERMISSION_DENIED, "Anda tidak memiliki izin untuk tindakan ini.", status_code=403)
        ex = services.create_exception(actor=request.user, entry=entry, data=data.validated_data)
        return Response(ExceptionSerializer(ex).data, status=status.HTTP_201_CREATED)

    @extend_schema(
        parameters=[OpenApiParameter(p, str) for p in ("date", "classroom_id", "teacher_id", "student_id", "mine")], responses={200: dict}
    )
    @action(detail=False, methods=["get"])
    def timetable(self, request):
        """Weekly view with exceptions applied: own (teacher), a class, a teacher, or a student/child (scoped)."""
        q = TimetableQuery(data=request.query_params)
        q.is_valid(raise_exception=True)
        v = q.validated_data
        on_date = v.get("date") or timezone.localdate()
        entries = ScheduleEntry.objects.filter(active=True)
        if v.get("student_id") or (v["mine"] and not teacher_of(request.user)):
            student = (
                students_visible_to(request.user).filter(pk=v.get("student_id")).first()
                if v.get("student_id")
                else students_visible_to(request.user).filter(user=request.user).first()
            )
            if student is None:
                raise ScopeDenied()
            enr = student.enrollments.filter(
                status=EnrollmentStatus.ACTIVE, academic_year__start_date__lte=on_date, academic_year__end_date__gte=on_date
            ).first()
            entries = entries.filter(classroom_id=enr.classroom_id) if enr else entries.none()
            title = f"{student.full_name}" + (f" · {enr.classroom.name}" if enr else "")
        elif v["mine"] or v.get("teacher_id"):
            teacher = teacher_of(request.user) if v["mine"] else Teacher.objects.filter(pk=v["teacher_id"]).first()
            if teacher is None or (not v["mine"] and not user_has_perm(request.user, "schedule.view")):
                raise ScopeDenied()
            entries = entries.filter(teaching_assignment__teacher=teacher)
            title = teacher.full_name
            subs = ScheduleException.objects.filter(substitute_teacher=teacher).values_list("schedule_entry_id", flat=True)
            entries = ScheduleEntry.objects.filter(active=True).filter(pk__in=list(entries.values_list("pk", flat=True)) + list(subs))
        elif v.get("classroom_id"):
            if not user_has_perm(request.user, "schedule.view"):
                raise DomainError(ErrorCode.PERMISSION_DENIED, "Anda tidak memiliki izin untuk tindakan ini.", status_code=403)
            classroom = ClassRoom.objects.filter(pk=v["classroom_id"]).first()
            if classroom is None:
                raise ScopeDenied()
            entries = entries.filter(classroom=classroom)
            title = classroom.name
        else:
            raise DomainError(ErrorCode.VALIDATION_ERROR, "Data tidak valid.", fields={"classroom_id": ["Pilih rombel, guru, atau siswa."]})
        rows = services.weekly_timetable(entries, on_date)
        if v["mine"] and teacher_of(request.user):
            teacher = teacher_of(request.user)
            rows = [r for r in rows if r["teacher"] == teacher.full_name]
        bells = list(BellPeriod.objects.filter(active=True).values("id", "name", "sequence", "start_time", "end_time"))
        return Response({"title": title, "week": [str(d) for d in services.week_of(on_date)], "bell_periods": bells, "slots": rows})


@extend_schema_view(list=extend_schema(parameters=[OpenApiParameter(p, str) for p in ("date_from", "date_to", "exception_type")]))
@extend_schema(tags=["schedules"])
class ScheduleExceptionViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    serializer_class = ExceptionSerializer
    permission_classes = [ActionPermission]
    required_permissions = {"list": "schedule.view"}
    filter_backends = []

    def get_queryset(self):
        qs = ScheduleException.objects.select_related(
            "schedule_entry__classroom",
            "schedule_entry__teaching_assignment__teacher",
            "schedule_entry__teaching_assignment__subject_offering__subject",
            "substitute_teacher",
            "new_bell_period",
            "new_room",
        )
        p = self.request.query_params
        if v := p.get("date_from"):
            qs = qs.filter(date__gte=v)
        if v := p.get("date_to"):
            qs = qs.filter(date__lte=v)
        if v := p.get("exception_type"):
            qs = qs.filter(exception_type=v)
        return qs

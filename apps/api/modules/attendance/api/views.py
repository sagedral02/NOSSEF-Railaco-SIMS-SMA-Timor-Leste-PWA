"""Attendance endpoints (PRD §20.6, §47 Attendance rows)."""

from django.db.models import Count, Q
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from common.api.exceptions import DomainError, ErrorCode, ScopeDenied
from common.permissions import ActionPermission, user_has_global, user_has_perm
from modules.academics.models import ClassRoom, Trimester
from modules.academics.selectors import homeroom_classroom_ids, teacher_of
from modules.documents import services as files
from modules.schedules import services as schedule_services
from modules.schedules.models import ScheduleEntry
from modules.staff.models import StaffProfile, Teacher
from modules.students.selectors import staff_classroom_ids, students_visible_to

from .. import services
from ..models import AttendanceRecord, AttendanceSession, AttendanceStatus, StaffAttendance, StudentLeaveRequest


class SessionSerializer(serializers.ModelSerializer):
    classroom_name = serializers.CharField(source="classroom.name", read_only=True)
    subject_code = serializers.CharField(source="teaching_assignment.subject_offering.subject.code", read_only=True, default=None)
    bell_period_name = serializers.CharField(source="schedule_entry.bell_period.name", read_only=True, default=None)
    trimester_number = serializers.IntegerField(source="trimester.number", read_only=True)

    class Meta:
        model = AttendanceSession
        fields = (
            "id",
            "academic_year",
            "trimester",
            "trimester_number",
            "classroom",
            "classroom_name",
            "date",
            "session_type",
            "schedule_entry",
            "teaching_assignment",
            "subject_code",
            "bell_period_name",
            "status",
            "version",
            "submitted_at",
            "locked_at",
        )
        read_only_fields = fields


class OpenSessionSerializer(serializers.Serializer):
    classroom = serializers.PrimaryKeyRelatedField(queryset=ClassRoom.objects.all(), required=False)
    date = serializers.DateField(required=False)
    session_type = serializers.ChoiceField(choices=AttendanceSession.SessionType.choices)
    schedule_entry = serializers.PrimaryKeyRelatedField(queryset=ScheduleEntry.objects.all(), required=False, allow_null=True)

    def validate(self, attrs):
        if attrs.get("schedule_entry") and not attrs.get("classroom"):
            attrs["classroom"] = attrs["schedule_entry"].classroom
        if not attrs.get("classroom"):
            raise serializers.ValidationError({"classroom": "Wajib diisi."})
        attrs.setdefault("date", timezone.localdate())
        return attrs


class RecordInputSerializer(serializers.Serializer):
    student_id = serializers.UUIDField()
    status = serializers.ChoiceField(choices=AttendanceStatus.choices)
    minutes_late = serializers.IntegerField(required=False, allow_null=True, min_value=0)
    note = serializers.CharField(required=False, allow_blank=True, default="")
    expected_version = serializers.IntegerField(required=False, allow_null=True)


class BulkRecordsSerializer(serializers.Serializer):
    records = RecordInputSerializer(many=True)


class CorrectionSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=AttendanceStatus.choices)
    minutes_late = serializers.IntegerField(required=False, allow_null=True)
    reason = serializers.CharField()


class OfflineMutationSerializer(serializers.Serializer):
    mutation_id = serializers.UUIDField()
    student_id = serializers.UUIDField()
    base_record_version = serializers.IntegerField(required=False, allow_null=True)
    status = serializers.ChoiceField(choices=AttendanceStatus.choices)
    minutes_late = serializers.IntegerField(required=False, allow_null=True)
    note = serializers.CharField(required=False, allow_blank=True, default="")
    client_recorded_at = serializers.DateTimeField(required=False)


class OfflineSyncSerializer(serializers.Serializer):
    batch_id = serializers.UUIDField()
    device_id = serializers.CharField(max_length=100)
    session_id = serializers.UUIDField()
    base_session_version = serializers.IntegerField(required=False, allow_null=True)
    mutations = OfflineMutationSerializer(many=True)

    def validate_mutations(self, value):
        if len(value) > 200:
            raise serializers.ValidationError("Maksimal 200 mutasi per batch.")
        return value


def session_payload(session, user):
    roster = list(services.roster(session.classroom, session.date))
    records = {r.student_id: r for r in session.records.all()}
    leave = services.approved_leave([s.pk for s in roster], session.date)
    return {
        **SessionSerializer(session).data,
        "can_record": services.can_record(user, session),
        "roster": [
            {
                "student_id": str(s.pk),
                "student_no": s.student_no,
                "full_name": s.full_name,
                "gender": s.gender,
                "leave": leave.get(s.pk),
                "record": (
                    {"id": str(r.pk), "status": r.status, "minutes_late": r.minutes_late, "note": r.note, "version": r.version}
                    if (r := records.get(s.pk))
                    else None
                ),
            }
            for s in roster
        ],
    }


SESSION_PARAMS = [OpenApiParameter(p, str) for p in ("date", "date_from", "date_to", "classroom_id", "status", "session_type")]


@extend_schema_view(list=extend_schema(parameters=SESSION_PARAMS))
@extend_schema(tags=["attendance"])
class SessionViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    serializer_class = SessionSerializer
    queryset = AttendanceSession.objects.none()
    permission_classes = [ActionPermission]
    required_permissions = {
        "list": "attendance.view",
        "retrieve": "attendance.view",
        "create": "attendance.record",
        "records": "attendance.record",
        "record": "attendance.record",
        "submit": "attendance.record",
        "lock": ("attendance.approve", "attendance.correct"),
    }
    filter_backends = []

    def get_queryset(self):
        qs = AttendanceSession.objects.select_related(
            "classroom",
            "trimester",
            "schedule_entry__bell_period",
            "teaching_assignment__subject_offering__subject",
            "schedule_entry__teaching_assignment",
        )
        user = self.request.user
        if not user_has_global(user, "attendance.view"):
            teacher = teacher_of(user)
            scope = Q(classroom_id__in=staff_classroom_ids(user))
            if teacher:
                scope |= Q(schedule_entry__exceptions__substitute_teacher=teacher)
            qs = qs.filter(scope).distinct()
        p = self.request.query_params
        for param, field in (("date", "date"), ("classroom_id", "classroom_id"), ("status", "status"), ("session_type", "session_type")):
            if v := p.get(param):
                qs = qs.filter(**{field: v})
        if v := p.get("date_from"):
            qs = qs.filter(date__gte=v)
        if v := p.get("date_to"):
            qs = qs.filter(date__lte=v)
        return qs

    def _session(self, pk):
        s = self.get_queryset().filter(pk=pk).first()
        if s is None:
            raise ScopeDenied()
        return s

    @extend_schema(request=OpenSessionSerializer, responses={201: dict})
    def create(self, request):
        data = OpenSessionSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        session, created = services.open_session(actor=request.user, **data.validated_data)
        return Response(session_payload(session, request.user), status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    @extend_schema(responses={200: dict})
    def retrieve(self, request, pk=None):
        session = AttendanceSession.objects.filter(pk=pk).select_related("classroom", "schedule_entry__teaching_assignment").first()
        if session is None or not services.can_view_session(request.user, session):
            raise ScopeDenied()
        return Response(session_payload(session, request.user))

    @extend_schema(request=BulkRecordsSerializer, responses={200: dict})
    @action(detail=True, methods=["put"])
    def records(self, request, pk=None):
        data = BulkRecordsSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        session = services.set_records(actor=request.user, session=self._session(pk), items=data.validated_data["records"])
        return Response(session_payload(session, request.user))

    @extend_schema(request=RecordInputSerializer, responses={200: dict})
    @action(detail=True, methods=["patch"], url_path=r"records/(?P<student_id>[0-9a-f-]+)")
    def record(self, request, pk=None, student_id=None):
        data = RecordInputSerializer(data={**request.data, "student_id": student_id})
        data.is_valid(raise_exception=True)
        session = services.set_records(actor=request.user, session=self._session(pk), items=[data.validated_data])
        return Response(session_payload(session, request.user))

    @extend_schema(request=None, responses={200: dict})
    @action(detail=True, methods=["post"])
    def submit(self, request, pk=None):
        session = services.submit(actor=request.user, session=self._session(pk))
        return Response(session_payload(session, request.user))

    @extend_schema(request=None, responses={200: dict})
    @action(detail=True, methods=["post"])
    def lock(self, request, pk=None):
        session = services.lock(actor=request.user, session=self._session(pk))
        return Response(session_payload(session, request.user))


class RecordCorrectView(APIView):
    @extend_schema(tags=["attendance"], request=CorrectionSerializer, responses={200: dict})
    def post(self, request, pk):
        record = AttendanceRecord.objects.filter(pk=pk).select_related("session__classroom").first()
        if record is None or not services.can_view_session(request.user, record.session):
            raise ScopeDenied()
        data = CorrectionSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        rec = services.correct(
            actor=request.user, record=record, to_status=v["status"], minutes_late=v.get("minutes_late"), reason=v["reason"]
        )
        return Response({"id": str(rec.pk), "status": rec.status, "minutes_late": rec.minutes_late, "version": rec.version})


class OfflineSyncView(APIView):
    @extend_schema(tags=["attendance"], request=OfflineSyncSerializer, responses={200: dict})
    def post(self, request):
        if not user_has_perm(request.user, "attendance.record"):
            raise DomainError(ErrorCode.PERMISSION_DENIED, "Anda tidak memiliki izin untuk tindakan ini.", status_code=403)
        data = OfflineSyncSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        session = AttendanceSession.objects.filter(pk=v["session_id"]).first()
        if session is None:
            raise ScopeDenied()
        return Response(
            services.offline_sync(
                actor=request.user,
                device_id=v["device_id"],
                session=session,
                base_session_version=v.get("base_session_version"),
                mutations=v["mutations"],
            )
        )


class MyClassesView(APIView):
    """Teacher's lessons (incl. substitutions) and homeroom daily attendance for a date, with session state (PRD §64 /attendance/today)."""

    @extend_schema(tags=["attendance"], parameters=[OpenApiParameter("date", str)], responses={200: dict})
    def get(self, request):
        on_date = serializers.DateField().to_internal_value(request.query_params.get("date") or str(timezone.localdate()))
        teacher = teacher_of(request.user)
        if teacher is None:
            return Response({"date": on_date, "lessons": [], "homeroom": []})
        ids = set(ScheduleEntry.objects.filter(active=True, teaching_assignment__teacher=teacher).values_list("pk", flat=True))
        ids |= set(
            ScheduleEntry.objects.filter(exceptions__date=on_date, exceptions__substitute_teacher=teacher).values_list("pk", flat=True)
        )
        lessons = []
        for row in schedule_services.weekly_timetable(ScheduleEntry.objects.filter(pk__in=ids), on_date):
            if row["date"] != on_date:
                continue
            is_sub = row["exception"] == "SUBSTITUTED" and row["teacher"] == teacher.full_name
            if row["exception"] == "SUBSTITUTED" and not is_sub:
                continue
            sess = AttendanceSession.objects.filter(schedule_entry_id=row["entry_id"], date=on_date).first()
            lessons.append(
                {**row, "substitute": is_sub, "session_id": str(sess.pk) if sess else None, "session_status": sess.status if sess else None}
            )
        lessons.sort(key=lambda r: r["start_time"])
        homeroom = []
        for c in ClassRoom.objects.filter(homeroom_teacher=teacher, active=True, academic_year__status="ACTIVE"):
            sess = AttendanceSession.objects.filter(classroom=c, date=on_date, session_type="DAILY").first()
            homeroom.append(
                {
                    "classroom_id": str(c.pk),
                    "classroom": c.name,
                    "session_id": str(sess.pk) if sess else None,
                    "session_status": sess.status if sess else None,
                }
            )
        return Response({"date": on_date, "teacher": teacher.full_name, "lessons": lessons, "homeroom": homeroom})


class StudentSummaryView(APIView):
    @extend_schema(
        tags=["attendance"], parameters=[OpenApiParameter(p, str) for p in ("trimester_id", "date_from", "date_to")], responses={200: dict}
    )
    def get(self, request, student_id):
        student = students_visible_to(request.user).filter(pk=student_id).first()
        if student is None:
            raise ScopeDenied()
        p = request.query_params
        trimester = Trimester.objects.filter(pk=p["trimester_id"]).first() if p.get("trimester_id") else None
        summary = services.student_summary(student, trimester=trimester, date_from=p.get("date_from"), date_to=p.get("date_to"))
        recent = (
            AttendanceRecord.objects.filter(student=student, session__status__in=["SUBMITTED", "LOCKED"])
            .exclude(status="PRESENT")
            .select_related("session__teaching_assignment__subject_offering__subject")
            .order_by("-session__date")[:30]
        )
        summary["recent_absences"] = [
            {
                "date": r.session.date,
                "status": r.status,
                "minutes_late": r.minutes_late,
                "session_type": r.session.session_type,
                "subject_code": r.session.teaching_assignment.subject_offering.subject.code if r.session.teaching_assignment else None,
            }
            for r in recent
        ]
        return Response(summary)


class ClassReportView(APIView):
    """Per-class recap for a date range (homeroom/admin review, PRD §64 /attendance/review)."""

    @extend_schema(
        tags=["attendance"], parameters=[OpenApiParameter(p, str) for p in ("classroom_id", "date_from", "date_to")], responses={200: dict}
    )
    def get(self, request):
        p = request.query_params
        classroom = ClassRoom.objects.filter(pk=p.get("classroom_id")).first()
        if classroom is None or not (user_has_global(request.user, "attendance.view") or classroom.pk in staff_classroom_ids(request.user)):
            raise ScopeDenied()
        date_from = p.get("date_from") or str(classroom.academic_year.start_date)
        date_to = p.get("date_to") or str(timezone.localdate())
        # One aggregate query instead of per-student summaries (PRD §39: no N+1 on reports).
        agg = (
            AttendanceRecord.objects.filter(
                session__classroom=classroom, session__date__range=(date_from, date_to), session__status__in=["SUBMITTED", "LOCKED"]
            )
            .values("student_id", "session__session_type", "status")
            .annotate(n=Count("id"))
        )
        per = {}
        for row in agg:
            per.setdefault(row["student_id"], {"DAILY": {}, "LESSON": {}})[row["session__session_type"]][row["status"]] = row["n"]
        rows = []
        for st in services.roster(classroom, timezone.localdate()):
            data = per.get(st.pk, {"DAILY": {}, "LESSON": {}})
            base = data["DAILY"] or data["LESSON"]
            total = sum(base.values())
            present = base.get("PRESENT", 0) + base.get("LATE", 0)
            rows.append(
                {
                    "student_id": str(st.pk),
                    "student_no": st.student_no,
                    "full_name": st.full_name,
                    "daily": {k: base.get(k, 0) for k in AttendanceStatus.values},
                    "total": total,
                    "attendance_rate": round(100 * present / total, 1) if total else None,
                }
            )
        sessions = AttendanceSession.objects.filter(classroom=classroom, date__range=(date_from, date_to))
        return Response(
            {
                "classroom": classroom.name,
                "date_from": date_from,
                "date_to": date_to,
                "sessions": sessions.count(),
                "open_sessions": sessions.filter(status="OPEN").count(),
                "students": rows,
            }
        )


# ---------------------------------------------------------------- leave requests


class LeaveSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    reviewed_by_username = serializers.CharField(source="reviewed_by.username", read_only=True, default=None)

    class Meta:
        model = StudentLeaveRequest
        fields = (
            "id",
            "student",
            "student_name",
            "start_date",
            "end_date",
            "leave_type",
            "reason",
            "supporting_file",
            "status",
            "reviewed_by_username",
            "review_note",
            "created_at",
        )
        read_only_fields = ("id", "student_name", "status", "reviewed_by_username", "review_note", "created_at")


class LeaveReviewSerializer(serializers.Serializer):
    approve = serializers.BooleanField()
    note = serializers.CharField(required=False, allow_blank=True, default="")


@extend_schema(tags=["attendance"])
class LeaveViewSet(mixins.ListModelMixin, mixins.CreateModelMixin, viewsets.GenericViewSet):
    serializer_class = LeaveSerializer
    queryset = StudentLeaveRequest.objects.none()
    permission_classes = [ActionPermission]
    required_permissions = {"list": None, "create": None, "review": ("attendance.approve", "attendance.record", "attendance.correct")}
    filter_backends = []

    def get_queryset(self):
        qs = StudentLeaveRequest.objects.select_related("student", "reviewed_by").filter(
            student__in=students_visible_to(self.request.user, "attendance.view")
        )
        if s := self.request.query_params.get("status"):
            qs = qs.filter(status=s)
        if s := self.request.query_params.get("student_id"):
            qs = qs.filter(student_id=s)
        return qs

    def create(self, request):
        data = LeaveSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v = dict(data.validated_data)
        student = students_visible_to(request.user, "attendance.view").filter(pk=v.pop("student").pk).first()
        if student is None:
            raise ScopeDenied()
        f = v.pop("supporting_file", None)
        if f is not None:
            files.attach(f, expected_purposes={"LEAVE_EVIDENCE"}, owner=request.user)
        leave = services.request_leave(actor=request.user, student=student, data=v, supporting_file=f)
        return Response(LeaveSerializer(leave).data, status=status.HTTP_201_CREATED)

    @extend_schema(request=LeaveReviewSerializer, responses={200: LeaveSerializer})
    @action(detail=True, methods=["post"])
    def review(self, request, pk=None):
        leave = self.get_queryset().filter(pk=pk).first()
        if leave is None:
            raise ScopeDenied()
        if not user_has_perm(request.user, "attendance.approve"):
            # Homeroom teacher may review leave for own homeroom students only.
            enr_classes = set(leave.student.enrollments.filter(status="ACTIVE").values_list("classroom_id", flat=True))
            if not enr_classes & homeroom_classroom_ids(request.user):
                raise DomainError(ErrorCode.PERMISSION_DENIED, "Hanya wali kelas/admin yang dapat meninjau izin.", status_code=403)
        data = LeaveReviewSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        return Response(LeaveSerializer(services.review_leave(actor=request.user, leave=leave, **data.validated_data)).data)


# ---------------------------------------------------------------- staff attendance (PRD §21)


class StaffAttendanceSerializer(serializers.ModelSerializer):
    person_name = serializers.SerializerMethodField()
    teacher = serializers.PrimaryKeyRelatedField(queryset=Teacher.objects.all(), required=False, allow_null=True)
    staff = serializers.PrimaryKeyRelatedField(queryset=StaffProfile.objects.all(), required=False, allow_null=True)

    class Meta:
        model = StaffAttendance
        fields = ("id", "person_type", "teacher", "staff", "person_name", "date", "status", "check_in_at", "check_out_at", "note")
        read_only_fields = ("id", "person_name")

    def get_person_name(self, obj) -> str:
        return obj.teacher.full_name if obj.teacher_id else obj.staff.full_name


@extend_schema_view(list=extend_schema(parameters=[OpenApiParameter(p, str) for p in ("date", "date_from", "date_to", "person_type")]))
@extend_schema(tags=["attendance"])
class StaffAttendanceViewSet(mixins.ListModelMixin, mixins.CreateModelMixin, viewsets.GenericViewSet):
    serializer_class = StaffAttendanceSerializer
    queryset = StaffAttendance.objects.none()
    permission_classes = [ActionPermission]
    required_permissions = {"list": None, "create": "staff.manage"}
    filter_backends = []

    def get_queryset(self):
        qs = StaffAttendance.objects.select_related("teacher", "staff")
        user = self.request.user
        if not user_has_perm(user, "staff.view"):
            # Staff can view only their own record (PRD §21).
            qs = qs.filter(Q(teacher__user=user) | Q(staff__user=user))
        p = self.request.query_params
        if v := p.get("date"):
            qs = qs.filter(date=v)
        if v := p.get("date_from"):
            qs = qs.filter(date__gte=v)
        if v := p.get("date_to"):
            qs = qs.filter(date__lte=v)
        if v := p.get("person_type"):
            qs = qs.filter(person_type=v)
        return qs

    def create(self, request):
        data = StaffAttendanceSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        obj = services.upsert_staff_attendance(actor=request.user, data=data.validated_data)
        return Response(StaffAttendanceSerializer(obj).data, status=status.HTTP_201_CREATED)

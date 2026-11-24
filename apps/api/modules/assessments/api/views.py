"""Assessment/gradebook endpoints (PRD §47 Grades rows, §22.4, §64 /grades/*)."""

from django.db import transaction
from django.db.models import Count, Q
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from common.api.exceptions import ConflictError, DomainError, ErrorCode, ScopeDenied
from common.permissions import ActionPermission, user_has_global, user_has_perm
from modules.academics.models import SubjectOffering, TeachingAssignment, Trimester
from modules.academics.selectors import homeroom_classroom_ids, teacher_of
from modules.students.selectors import students_visible_to

from .. import services
from ..models import Assessment, AssessmentType, GradingComponent, GradingScheme, StudentScore, TermGrade


class AssessmentTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = AssessmentType
        fields = ("id", "code", "name", "active")


class ComponentSerializer(serializers.ModelSerializer):
    assessment_type_code = serializers.CharField(source="assessment_type.code", read_only=True)

    class Meta:
        model = GradingComponent
        fields = ("id", "assessment_type", "assessment_type_code", "name", "weight_percent", "sequence", "is_cau_component")
        read_only_fields = ("id", "assessment_type_code")


class SchemeSerializer(serializers.ModelSerializer):
    components = ComponentSerializer(many=True)
    subject_code = serializers.CharField(source="subject_offering.subject.code", read_only=True)
    grade_level_code = serializers.CharField(source="subject_offering.grade_level.code", read_only=True)
    major_code = serializers.CharField(source="subject_offering.major.code", read_only=True, default=None)
    trimester_number = serializers.IntegerField(source="trimester.number", read_only=True)

    class Meta:
        model = GradingScheme
        fields = (
            "id",
            "academic_year",
            "trimester",
            "trimester_number",
            "subject_offering",
            "subject_code",
            "grade_level_code",
            "major_code",
            "name",
            "status",
            "passing_score",
            "passing_inclusive",
            "scale_max",
            "precision",
            "aggregation",
            "absent_policy",
            "remedial_policy",
            "components",
        )
        read_only_fields = ("id", "status", "academic_year", "subject_code", "grade_level_code", "major_code", "trimester_number")

    def validate(self, attrs):
        if self.instance is not None and self.instance.status != GradingScheme.Status.DRAFT:
            raise serializers.ValidationError(
                {"non_field_errors": ["Skema aktif tidak dapat diubah; buat skema baru di trimestre berikutnya."]}
            )
        trimester = attrs.get("trimester") or getattr(self.instance, "trimester", None)
        offering = attrs.get("subject_offering") or getattr(self.instance, "subject_offering", None)
        if trimester and offering and trimester.academic_year_id != offering.academic_year_id:
            raise serializers.ValidationError({"trimester": "Trimestre dan penawaran mapel beda tahun ajaran."})
        return attrs

    @transaction.atomic
    def create(self, validated):
        comps = validated.pop("components")
        validated["academic_year"] = validated["trimester"].academic_year
        scheme = GradingScheme.objects.create(**validated)
        for c in comps:
            GradingComponent.objects.create(grading_scheme=scheme, **c)
        return scheme

    @transaction.atomic
    def update(self, instance, validated):
        comps = validated.pop("components", None)
        for k, v in validated.items():
            setattr(instance, k, v)
        instance.save()
        if comps is not None:
            instance.components.all().delete()
            for c in comps:
                GradingComponent.objects.create(grading_scheme=instance, **c)
        return instance


class AssessmentSerializer(serializers.ModelSerializer):
    component_name = serializers.CharField(source="grading_component.name", read_only=True)
    type_code = serializers.CharField(source="assessment_type.code", read_only=True)
    graded = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Assessment
        fields = (
            "id",
            "teaching_assignment",
            "trimester",
            "assessment_type",
            "type_code",
            "grading_component",
            "component_name",
            "title",
            "assessment_date",
            "max_score",
            "cau_number",
            "is_remedial",
            "status",
            "version",
            "graded",
        )
        read_only_fields = ("id", "assessment_type", "type_code", "component_name", "cau_number", "status", "version", "graded")


class ScoreItemSerializer(serializers.Serializer):
    student_id = serializers.UUIDField()
    score = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    status = serializers.ChoiceField(choices=StudentScore.Status.choices, required=False)
    expected_version = serializers.IntegerField(required=False, allow_null=True)
    reason = serializers.CharField(required=False, allow_blank=True)


class ScoresSerializer(serializers.Serializer):
    scores = ScoreItemSerializer(many=True)


class StatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=["OPEN", "CLOSED", "LOCKED"])
    reason = serializers.CharField(required=False, allow_blank=True, default="")


class TermGradeSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    student_no = serializers.CharField(source="student.student_no", read_only=True)
    subject_code = serializers.CharField(source="teaching_assignment.subject_offering.subject.code", read_only=True)
    subject_name = serializers.CharField(source="teaching_assignment.subject_offering.subject.name", read_only=True)
    trimester_number = serializers.IntegerField(source="trimester.number", read_only=True)

    class Meta:
        model = TermGrade
        fields = (
            "id",
            "student",
            "student_name",
            "student_no",
            "trimester",
            "trimester_number",
            "teaching_assignment",
            "subject_code",
            "subject_name",
            "calculated_score",
            "final_score",
            "grade_label",
            "status",
            "breakdown",
            "override_reason",
            "finalized_at",
            "version",
        )
        read_only_fields = fields


class AssignmentTrimesterSerializer(serializers.Serializer):
    teaching_assignment = serializers.PrimaryKeyRelatedField(
        queryset=TeachingAssignment.objects.select_related("classroom", "subject_offering")
    )
    trimester = serializers.PrimaryKeyRelatedField(queryset=Trimester.objects.all())
    student_ids = serializers.ListField(child=serializers.UUIDField(), required=False, allow_null=True)


class ReasonSerializer(serializers.Serializer):
    reason = serializers.CharField()


class OverrideSerializer(ReasonSerializer):
    final_score = serializers.DecimalField(max_digits=7, decimal_places=4)


class GenerateSchemesSerializer(serializers.Serializer):
    trimester = serializers.PrimaryKeyRelatedField(queryset=Trimester.objects.all())
    scale_max = serializers.DecimalField(max_digits=6, decimal_places=2, default="10")
    passing_score = serializers.DecimalField(max_digits=6, decimal_places=2, default="5")
    passing_inclusive = serializers.BooleanField(default=False)


# ---------------------------------------------------------------- views


@extend_schema(tags=["grades"])
class AssessmentTypeViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    serializer_class = AssessmentTypeSerializer
    queryset = AssessmentType.objects.filter(active=True)
    permission_classes = [ActionPermission]
    required_permissions = {"list": "assessment.view"}
    pagination_class = None
    filter_backends = []


@extend_schema_view(list=extend_schema(parameters=[OpenApiParameter(p, str) for p in ("trimester_id", "subject_offering_id", "status")]))
@extend_schema(tags=["grades"])
class SchemeViewSet(
    mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet
):
    serializer_class = SchemeSerializer
    permission_classes = [ActionPermission]
    required_permissions = {
        "list": "assessment.view",
        "retrieve": "assessment.view",
        "create": "assessment.create",
        "partial_update": "assessment.update",
        "activate": "assessment.update",
        "generate": "assessment.create",
    }
    http_method_names = ["get", "post", "patch"]
    filter_backends = []

    def get_queryset(self):
        qs = GradingScheme.objects.select_related(
            "trimester", "subject_offering__subject", "subject_offering__grade_level", "subject_offering__major"
        ).prefetch_related("components__assessment_type")
        p = self.request.query_params
        for param, f in (("trimester_id", "trimester_id"), ("subject_offering_id", "subject_offering_id"), ("status", "status")):
            if v := p.get(param):
                qs = qs.filter(**{f: v})
        return qs.order_by("subject_offering__grade_level__sequence", "subject_offering__subject__code")

    def create(self, request, *args, **kwargs):
        if not user_has_global(request.user, "assessment.create"):
            raise DomainError(ErrorCode.PERMISSION_DENIED, "Skema penilaian dikelola oleh kurikulum.", status_code=403)
        return super().create(request, *args, **kwargs)

    @extend_schema(request=None, responses={200: SchemeSerializer})
    @action(detail=True, methods=["post"])
    def activate(self, request, pk=None):
        if not user_has_global(request.user, "assessment.update"):
            raise DomainError(ErrorCode.PERMISSION_DENIED, "Skema penilaian dikelola oleh kurikulum.", status_code=403)
        scheme = services.activate_scheme(actor=request.user, scheme=self.get_object())
        return Response(SchemeSerializer(self.get_queryset().get(pk=scheme.pk)).data)

    @extend_schema(request=GenerateSchemesSerializer, responses={200: dict})
    @action(detail=False, methods=["post"])
    def generate(self, request):
        """Create + activate the default NOSSEF scheme for every offering of the year lacking one in this trimester."""
        if not user_has_global(request.user, "assessment.create"):
            raise DomainError(ErrorCode.PERMISSION_DENIED, "Skema penilaian dikelola oleh kurikulum.", status_code=403)
        data = GenerateSchemesSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        t = v["trimester"]
        created = 0
        for off in SubjectOffering.objects.filter(academic_year=t.academic_year, active=True).select_related("subject"):
            if services.active_scheme(off, t) is None:
                services.create_scheme_from_template(
                    actor=request.user,
                    offering=off,
                    trimester=t,
                    scale_max=v["scale_max"],
                    passing_score=v["passing_score"],
                    passing_inclusive=v["passing_inclusive"],
                )
                created += 1
        return Response({"created": created})


def _scoped_assignment(user, pk, *, manage=False):
    ta = TeachingAssignment.objects.select_related("classroom", "subject_offering__subject", "teacher").filter(pk=pk).first()
    if ta is None or not (services.can_manage_assignment(user, ta) if manage else services.can_view_assignment(user, ta)):
        raise ScopeDenied()
    return ta


@extend_schema_view(list=extend_schema(parameters=[OpenApiParameter(p, str) for p in ("teaching_assignment_id", "trimester_id", "status")]))
@extend_schema(tags=["grades"])
class AssessmentViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    serializer_class = AssessmentSerializer
    queryset = Assessment.objects.none()
    permission_classes = [ActionPermission]
    required_permissions = {
        "list": "assessment.view",
        "retrieve": "assessment.view",
        "create": "assessment.create",
        "partial_update": "assessment.update",
        "scores": "score.record",
        "set_status": ("assessment.update", "grade.finalize", "grade.reopen"),
    }
    http_method_names = ["get", "post", "patch", "put"]
    filter_backends = []
    pagination_class = None

    def get_queryset(self):
        qs = Assessment.objects.select_related("grading_component", "assessment_type", "teaching_assignment", "trimester").annotate(
            graded=Count("scores", filter=Q(scores__status__in=["GRADED", "ABSENT", "EXCUSED"]))
        )
        user = self.request.user
        if not user_has_global(user, "assessment.view"):
            teacher = teacher_of(user)
            qs = (
                qs.filter(Q(teaching_assignment__teacher=teacher) | Q(teaching_assignment__classroom_id__in=homeroom_classroom_ids(user)))
                if teacher
                else qs.none()
            )
        p = self.request.query_params
        for param, f in (("teaching_assignment_id", "teaching_assignment_id"), ("trimester_id", "trimester_id"), ("status", "status")):
            if v := p.get(param):
                qs = qs.filter(**{f: v})
        return qs

    def create(self, request):
        data = AssessmentSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        a = services.create_assessment(
            actor=request.user,
            assignment=v["teaching_assignment"],
            trimester=v["trimester"],
            component=v["grading_component"],
            title=v["title"],
            assessment_date=v["assessment_date"],
            max_score=v["max_score"],
            is_remedial=v.get("is_remedial", False),
        )
        return Response(AssessmentSerializer(self.get_queryset().get(pk=a.pk)).data, status=status.HTTP_201_CREATED)

    def partial_update(self, request, pk=None):
        a = self.get_object()
        if not services.can_manage_assignment(request.user, a.teaching_assignment):
            raise ScopeDenied()
        if a.status == "LOCKED":
            raise ConflictError(ErrorCode.ASSESSMENT_LOCKED, "Penilaian terkunci.")
        data = AssessmentSerializer(a, data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        allowed = {"title", "assessment_date", "max_score"}
        changes = {k: v for k, v in data.validated_data.items() if k in allowed}
        if "max_score" in changes and a.scores.filter(score__gt=changes["max_score"]).exists():
            raise DomainError(ErrorCode.ASSESSMENT_SCORE_OUT_OF_RANGE, "Ada nilai yang melebihi skor maksimum baru.")
        for k, v in changes.items():
            setattr(a, k, v)
        a.version += 1
        a.save()
        return Response(AssessmentSerializer(self.get_queryset().get(pk=a.pk)).data)

    @extend_schema(request=ScoresSerializer, responses={200: dict})
    @action(detail=True, methods=["put"])
    def scores(self, request, pk=None):
        a = self.get_object()
        data = ScoresSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        changed = services.save_scores(actor=request.user, assessment=a, items=data.validated_data["scores"])
        return Response({"changed": changed})

    @extend_schema(request=StatusSerializer, responses={200: AssessmentSerializer})
    @action(detail=True, methods=["post"], url_path="status")
    def set_status(self, request, pk=None):
        data = StatusSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        a = services.set_assessment_status(
            actor=request.user, assessment=self.get_object(), target=data.validated_data["status"], reason=data.validated_data["reason"]
        )
        return Response(AssessmentSerializer(self.get_queryset().get(pk=a.pk)).data)


class GradebookView(APIView):
    """Spreadsheet-like gradebook (PRD §22.4): roster × assessments, plus server-calculated preview."""

    @extend_schema(
        tags=["grades"],
        parameters=[OpenApiParameter("teaching_assignment_id", str), OpenApiParameter("trimester_id", str)],
        responses={200: dict},
    )
    def get(self, request):
        if not user_has_perm(request.user, "assessment.view"):
            raise DomainError(ErrorCode.PERMISSION_DENIED, "Anda tidak memiliki izin untuk tindakan ini.", status_code=403)
        ta = _scoped_assignment(request.user, request.query_params.get("teaching_assignment_id"))
        trimester = Trimester.objects.filter(pk=request.query_params.get("trimester_id")).first()
        if trimester is None:
            raise DomainError(ErrorCode.VALIDATION_ERROR, "Data tidak valid.", fields={"trimester_id": ["Wajib."]})
        scheme = services.active_scheme(ta.subject_offering, trimester)
        assessments = list(Assessment.objects.filter(teaching_assignment=ta, trimester=trimester).select_related("grading_component"))
        students = list(services.roster(ta, trimester))
        scores = {(s.assessment_id, s.student_id): s for s in StudentScore.objects.filter(assessment__in=assessments)}
        grades = {g.student_id: g for g in TermGrade.objects.filter(teaching_assignment=ta, trimester=trimester)}
        preview = {}
        if scheme is not None:
            _, preview = services.compute(ta, trimester, students)
        return Response(
            {
                "teaching_assignment": {
                    "id": str(ta.pk),
                    "classroom": ta.classroom.name,
                    "subject_code": ta.subject_offering.subject.code,
                    "subject_name": ta.subject_offering.subject.name,
                    "teacher": ta.teacher.full_name,
                },
                "trimester": {
                    "id": str(trimester.pk),
                    "number": trimester.number,
                    "status": trimester.status,
                    "grade_entry_start": trimester.grade_entry_start,
                    "grade_entry_end": trimester.grade_entry_end,
                },
                "can_edit": services.can_manage_assignment(request.user, ta),
                "can_finalize": user_has_perm(request.user, "grade.finalize") and services.can_manage_assignment(request.user, ta),
                "can_reopen": user_has_perm(request.user, "grade.reopen"),
                "scheme": SchemeSerializer(scheme).data if scheme else None,
                "assessments": AssessmentSerializer(assessments, many=True).data,
                "students": [
                    {
                        "student_id": str(st.pk),
                        "student_no": st.student_no,
                        "full_name": st.full_name,
                        "scores": {
                            str(a.pk): (
                                {"score": str(sc.score) if sc.score is not None else None, "status": sc.status, "version": sc.version}
                                if (sc := scores.get((a.pk, st.pk)))
                                else None
                            )
                            for a in assessments
                        },
                        "preview": (
                            {
                                "final": str(r.final) if r.final is not None else None,
                                "complete": r.complete,
                                "missing": r.missing,
                                "components": r.components,
                            }
                            if (r := preview.get(st.pk))
                            else None
                        ),
                        "term_grade": TermGradeSerializer(g).data if (g := grades.get(st.pk)) else None,
                    }
                    for st in students
                ],
            }
        )


class MyAssignmentsView(APIView):
    @extend_schema(
        tags=["grades"],
        parameters=[OpenApiParameter("academic_year_id", str), OpenApiParameter("classroom_id", str)],
        responses={200: dict},
    )
    def get(self, request):
        qs = TeachingAssignment.objects.filter(active=True).select_related(
            "classroom", "subject_offering__subject", "teacher", "academic_year"
        )
        if user_has_global(request.user, "assessment.view"):
            if v := request.query_params.get("classroom_id"):
                qs = qs.filter(classroom_id=v)
        else:
            teacher = teacher_of(request.user)
            if teacher is None:
                return Response([])
            qs = qs.filter(Q(teacher=teacher) | Q(classroom_id__in=homeroom_classroom_ids(request.user)))
        if v := request.query_params.get("academic_year_id"):
            qs = qs.filter(academic_year_id=v)
        else:
            qs = qs.filter(academic_year__is_current=True)
        return Response(
            [
                {
                    "id": str(t.pk),
                    "classroom": t.classroom.name,
                    "classroom_id": str(t.classroom_id),
                    "subject_code": t.subject_offering.subject.code,
                    "subject_name": t.subject_offering.subject.name,
                    "teacher": t.teacher.full_name,
                    "academic_year_id": str(t.academic_year_id),
                }
                for t in qs.order_by("classroom__code", "subject_offering__subject__code")
            ]
        )


def _term_grade(pk):
    tg = TermGrade.objects.filter(pk=pk).first()
    if tg is None:
        raise ScopeDenied()
    return tg


@extend_schema_view(
    list=extend_schema(parameters=[OpenApiParameter(p, str) for p in ("student_id", "teaching_assignment_id", "trimester_id", "status")])
)
@extend_schema(tags=["grades"])
class TermGradeViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    serializer_class = TermGradeSerializer
    queryset = TermGrade.objects.none()
    permission_classes = [ActionPermission]
    required_permissions = {
        "list": None,
        "calculate": "assessment.view",
        "finalize": "grade.finalize",
        "reopen": "grade.reopen",
        "override": "grade.reopen",
    }
    filter_backends = []

    def get_queryset(self):
        qs = TermGrade.objects.select_related("student", "trimester", "teaching_assignment__subject_offering__subject")
        user = self.request.user
        if not user_has_global(user, "assessment.view"):
            visible = students_visible_to(user, "assessment.view").values("pk")
            teacher = teacher_of(user)
            cond = Q(teaching_assignment__teacher=teacher) if teacher else Q(pk__in=[])
            cond |= Q(teaching_assignment__classroom_id__in=homeroom_classroom_ids(user))
            portal = getattr(user, "guardian_profile", None) or getattr(user, "student_profile", None)
            if portal:
                cond |= Q(student__in=visible, status="FINALIZED")  # portal sees finalized grades only (published view in report cards)
            qs = qs.filter(cond)
        p = self.request.query_params
        for param, f in (
            ("student_id", "student_id"),
            ("teaching_assignment_id", "teaching_assignment_id"),
            ("trimester_id", "trimester_id"),
            ("status", "status"),
        ):
            if v := p.get(param):
                qs = qs.filter(**{f: v})
        return qs

    @extend_schema(request=AssignmentTrimesterSerializer, responses={200: dict})
    @action(detail=False, methods=["post"])
    def calculate(self, request):
        data = AssignmentTrimesterSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        ta = _scoped_assignment(request.user, data.validated_data["teaching_assignment"].pk)
        _, results = services.recalculate(actor=request.user, assignment=ta, trimester=data.validated_data["trimester"])
        return Response(
            {
                "students": {
                    str(k): {"final": str(r.final) if r.final is not None else None, "complete": r.complete, "missing": r.missing}
                    for k, r in results.items()
                }
            }
        )

    @extend_schema(request=AssignmentTrimesterSerializer, responses={200: dict})
    @action(detail=False, methods=["post"])
    def finalize(self, request):
        data = AssignmentTrimesterSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        ta = _scoped_assignment(request.user, data.validated_data["teaching_assignment"].pk, manage=True)
        n = services.finalize(
            actor=request.user,
            assignment=ta,
            trimester=data.validated_data["trimester"],
            student_ids=data.validated_data.get("student_ids"),
        )
        return Response({"finalized": n})

    @extend_schema(request=ReasonSerializer, responses={200: TermGradeSerializer})
    @action(detail=True, methods=["post"])
    def reopen(self, request, pk=None):
        data = ReasonSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        tg = _term_grade(pk)
        return Response(TermGradeSerializer(services.reopen(actor=request.user, term_grade=tg, reason=data.validated_data["reason"])).data)

    @extend_schema(request=OverrideSerializer, responses={200: TermGradeSerializer})
    @action(detail=True, methods=["post"])
    def override(self, request, pk=None):
        data = OverrideSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        tg = _term_grade(pk)
        return Response(TermGradeSerializer(services.override_final(actor=request.user, term_grade=tg, **data.validated_data)).data)


class CompletionView(APIView):
    @extend_schema(tags=["grades"], parameters=[OpenApiParameter("trimester_id", str)], responses={200: dict})
    def get(self, request):
        if not user_has_perm(request.user, "assessment.view"):
            raise DomainError(ErrorCode.PERMISSION_DENIED, "Anda tidak memiliki izin untuk tindakan ini.", status_code=403)
        trimester = Trimester.objects.filter(pk=request.query_params.get("trimester_id")).first()
        if trimester is None:
            raise DomainError(ErrorCode.VALIDATION_ERROR, "Data tidak valid.", fields={"trimester_id": ["Wajib."]})
        scope = None if user_has_global(request.user, "assessment.view") else homeroom_classroom_ids(request.user)
        return Response(services.completion(trimester, scope))

"""National exam endpoints (PRD §47 NationalExam rows). Data is entered/imported from the official source only."""

from django.db import transaction
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import serializers

from common.api.crud import MasterDataViewSet, ModelCleanSerializer
from common.permissions import user_has_global
from modules.audit import services as audit
from modules.documents import services as files
from modules.students.models import StudentEnrollment
from modules.students.selectors import students_visible_to

from ..models import NationalExamRecord


class NationalExamSerializer(ModelCleanSerializer):
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    student_no = serializers.CharField(source="student.student_no", read_only=True)

    class Meta:
        model = NationalExamRecord
        fields = (
            "id",
            "student",
            "student_name",
            "student_no",
            "academic_year",
            "exam_name",
            "candidate_no",
            "status",
            "overall_score",
            "result_date",
            "certificate_no",
            "document_file",
            "updated_at",
        )
        read_only_fields = ("id", "student_name", "student_no", "updated_at")

    def validate(self, attrs):
        student = attrs.get("student") or getattr(self.instance, "student", None)
        year = attrs.get("academic_year") or getattr(self.instance, "academic_year", None)
        if (
            student
            and year
            and not StudentEnrollment.objects.filter(student=student, academic_year=year, grade_level__code="XII")
            .exclude(status="CANCELLED")
            .exists()
        ):
            raise serializers.ValidationError({"student": "Hanya siswa kelas XII pada tahun ajaran ini."})
        doc = attrs.get("document_file")
        if doc is not None:
            files.attach(doc, expected_purposes={"STUDENT_DOCUMENT"})
        return super().validate(attrs)


@extend_schema_view(list=extend_schema(parameters=[OpenApiParameter(p, str) for p in ("academic_year_id", "status", "student_id")]))
@extend_schema(tags=["national-exams"])
class NationalExamViewSet(MasterDataViewSet):
    serializer_class = NationalExamSerializer
    view_permission = ("report.view", "student.view")
    manage_permission = ("report.publish", "student.update")
    filter_backends = []

    def get_queryset(self):
        qs = NationalExamRecord.objects.select_related("student", "academic_year")
        user = self.request.user
        if not user_has_global(user, "report.view") and not user_has_global(user, "student.view"):
            qs = qs.filter(student__in=students_visible_to(user))
        p = self.request.query_params
        for param, f in (("academic_year_id", "academic_year_id"), ("status", "status"), ("student_id", "student_id")):
            if v := p.get(param):
                qs = qs.filter(**{f: v})
        return qs

    def perform_destroy(self, instance):
        # Official records are corrected, not deleted.
        from common.api.exceptions import ConflictError, ErrorCode

        raise ConflictError(ErrorCode.RESOURCE_IN_USE, "Data ujian nasional resmi tidak dihapus; perbarui statusnya.")

    def perform_update(self, serializer):
        with transaction.atomic():
            super().perform_update(serializer)
            audit.record("NATIONAL_EXAM_UPDATED", actor=self.request.user, resource=serializer.instance)

from rest_framework import serializers

from modules.academics.models import AcademicYear, ClassRoom, Major
from modules.documents.models import StoredFile

from ..models import DOCUMENT_TYPES, AdmissionDecision, AdmissionPeriod, Applicant, ApplicantDocument, ApplicantGuardian


class PeriodSerializer(serializers.ModelSerializer):
    academic_year = serializers.PrimaryKeyRelatedField(queryset=AcademicYear.objects.exclude(status="CLOSED"))
    academic_year_name = serializers.CharField(source="academic_year.name", read_only=True)
    applicant_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = AdmissionPeriod
        fields = (
            "id",
            "academic_year",
            "academic_year_name",
            "name",
            "registration_start",
            "registration_end",
            "capacity_total",
            "status",
            "required_documents",
            "applicant_count",
            "updated_at",
        )
        read_only_fields = ("id", "status", "academic_year_name", "applicant_count", "updated_at")

    def validate_required_documents(self, value):
        unknown = [v for v in value if v not in DOCUMENT_TYPES]
        if unknown:
            raise serializers.ValidationError(f"Jenis dokumen tidak dikenal: {unknown}")
        return list(dict.fromkeys(value))

    def validate(self, attrs):
        start = attrs.get("registration_start", getattr(self.instance, "registration_start", None))
        end = attrs.get("registration_end", getattr(self.instance, "registration_end", None))
        if start and end and start >= end:
            raise serializers.ValidationError({"registration_end": "Harus setelah tanggal mulai."})
        if self.instance is not None and self.instance.status == AdmissionPeriod.Status.COMPLETED:
            raise serializers.ValidationError({"non_field_errors": ["Periode sudah selesai."]})
        return attrs


class PublicPeriodSerializer(serializers.ModelSerializer):
    academic_year_name = serializers.CharField(source="academic_year.name", read_only=True)
    document_labels = serializers.SerializerMethodField()
    majors = serializers.SerializerMethodField()

    class Meta:
        model = AdmissionPeriod
        fields = (
            "id",
            "name",
            "academic_year_name",
            "registration_start",
            "registration_end",
            "required_documents",
            "document_labels",
            "majors",
        )
        read_only_fields = fields

    def get_document_labels(self, obj) -> dict:
        return DOCUMENT_TYPES

    def get_majors(self, obj) -> list:
        return [{"id": str(m.pk), "code": m.code, "name": m.name} for m in Major.objects.filter(active=True)]


class ApplicantGuardianSerializer(serializers.ModelSerializer):
    class Meta:
        model = ApplicantGuardian
        fields = ("id", "full_name", "relationship", "phone", "email", "occupation", "address", "is_primary")
        read_only_fields = ("id",)


class ApplicantDocumentSerializer(serializers.ModelSerializer):
    original_name = serializers.CharField(source="file.original_name", read_only=True)
    verified_by_username = serializers.CharField(source="verified_by.username", read_only=True, default=None)

    class Meta:
        model = ApplicantDocument
        fields = (
            "id",
            "document_type",
            "file",
            "original_name",
            "verification_status",
            "verified_by_username",
            "verified_at",
            "note",
            "created_at",
        )
        read_only_fields = fields


class DecisionSerializer(serializers.ModelSerializer):
    decided_by_username = serializers.CharField(source="decided_by.username", read_only=True)

    class Meta:
        model = AdmissionDecision
        fields = ("decision", "score", "rank", "decided_by_username", "decided_at", "note")
        read_only_fields = fields


class ApplicantListSerializer(serializers.ModelSerializer):
    desired_major_code = serializers.CharField(source="desired_major.code", read_only=True, default=None)
    period_name = serializers.CharField(source="admission_period.name", read_only=True)
    decision_score = serializers.DecimalField(source="decision.score", max_digits=6, decimal_places=2, read_only=True, default=None)
    decision_rank = serializers.IntegerField(source="decision.rank", read_only=True, default=None)

    class Meta:
        model = Applicant
        fields = (
            "id",
            "registration_no",
            "full_name",
            "birth_date",
            "gender",
            "previous_school",
            "desired_major",
            "desired_major_code",
            "status",
            "submitted_at",
            "admission_period",
            "period_name",
            "decision_score",
            "decision_rank",
            "student",
            "created_at",
        )
        read_only_fields = fields


class ApplicantDetailSerializer(ApplicantListSerializer):
    guardians = ApplicantGuardianSerializer(many=True, read_only=True)
    documents = serializers.SerializerMethodField()
    decision = DecisionSerializer(read_only=True, default=None)
    required_documents = serializers.ListField(source="admission_period.required_documents", read_only=True)
    student_no = serializers.CharField(source="student.student_no", read_only=True, default=None)

    class Meta(ApplicantListSerializer.Meta):
        fields = (
            *ApplicantListSerializer.Meta.fields,
            "birth_place",
            "phone",
            "email",
            "address",
            "re_registered_at",
            "guardians",
            "documents",
            "decision",
            "required_documents",
            "student_no",
        )
        read_only_fields = fields

    def get_documents(self, obj) -> list:
        return ApplicantDocumentSerializer(obj.documents.filter(active=True).select_related("file", "verified_by"), many=True).data


class ApplicantWriteSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=200)
    birth_place = serializers.CharField(max_length=100, required=False, allow_blank=True)
    birth_date = serializers.DateField()
    gender = serializers.ChoiceField(choices=["M", "F"], required=False, allow_blank=True)
    previous_school = serializers.CharField(max_length=200, required=False, allow_blank=True)
    phone = serializers.CharField(max_length=50, required=False, allow_blank=True)
    email = serializers.EmailField(required=False, allow_blank=True)
    address = serializers.CharField(required=False, allow_blank=True)
    desired_major = serializers.PrimaryKeyRelatedField(queryset=Major.objects.filter(active=True), required=False, allow_null=True)
    guardians = ApplicantGuardianSerializer(many=True, required=False)


class ApplicantCreateSerializer(ApplicantWriteSerializer):
    admission_period = serializers.PrimaryKeyRelatedField(queryset=AdmissionPeriod.objects.all())


class DocumentAttachSerializer(serializers.Serializer):
    document_type = serializers.ChoiceField(choices=list(DOCUMENT_TYPES))
    file = serializers.PrimaryKeyRelatedField(queryset=StoredFile.objects.all())


class PublicDocumentUploadSerializer(serializers.Serializer):
    document_type = serializers.ChoiceField(choices=list(DOCUMENT_TYPES))
    file = serializers.FileField()


class DocumentVerifySerializer(serializers.Serializer):
    verification_status = serializers.ChoiceField(choices=ApplicantDocument.Verification.choices)
    note = serializers.CharField(required=False, allow_blank=True, default="")


class NoteSerializer(serializers.Serializer):
    note = serializers.CharField(required=False, allow_blank=True, default="")


class DecisionInputSerializer(serializers.Serializer):
    decision = serializers.ChoiceField(choices=AdmissionDecision.Decision.choices)
    score = serializers.DecimalField(max_digits=6, decimal_places=2, required=False, allow_null=True)
    rank = serializers.IntegerField(required=False, allow_null=True, min_value=1)
    note = serializers.CharField(required=False, allow_blank=True, default="")


class EnrollInputSerializer(serializers.Serializer):
    classroom = serializers.PrimaryKeyRelatedField(queryset=ClassRoom.objects.filter(active=True))
    start_date = serializers.DateField(required=False)
    guardian_links = serializers.DictField(child=serializers.UUIDField(), required=False, default=dict)


class StatusLookupSerializer(serializers.Serializer):
    registration_no = serializers.CharField(max_length=50)
    birth_date = serializers.DateField()


class RecoverSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=200)
    birth_date = serializers.DateField()
    guardian_phone = serializers.CharField(max_length=50)


class PublicCreatedSerializer(serializers.Serializer):
    registration_no = serializers.CharField()
    access_token = serializers.CharField()
    applicant = ApplicantDetailSerializer()

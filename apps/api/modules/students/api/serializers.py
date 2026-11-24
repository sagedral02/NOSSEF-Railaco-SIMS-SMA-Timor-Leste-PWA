from rest_framework import serializers

from modules.academics.models import ClassRoom
from modules.documents.models import StoredFile

from ..models import (
    Guardian,
    Relationship,
    Student,
    StudentEnrollment,
    StudentGuardian,
    StudentStatus,
    StudentStatusHistory,
    StudentTransfer,
)
from ..selectors import current_enrollment


class EnrollmentSerializer(serializers.ModelSerializer):
    academic_year_name = serializers.CharField(source="academic_year.name", read_only=True)
    grade_level_code = serializers.CharField(source="grade_level.code", read_only=True)
    major_code = serializers.CharField(source="major.code", read_only=True)
    classroom_name = serializers.CharField(source="classroom.name", read_only=True)

    class Meta:
        model = StudentEnrollment
        fields = (
            "id",
            "academic_year",
            "academic_year_name",
            "grade_level",
            "grade_level_code",
            "major",
            "major_code",
            "classroom",
            "classroom_name",
            "status",
            "start_date",
            "end_date",
            "source",
        )
        read_only_fields = fields


class StudentListSerializer(serializers.ModelSerializer):
    current_enrollment = serializers.SerializerMethodField()

    class Meta:
        model = Student
        fields = ("id", "student_no", "national_student_no", "full_name", "gender", "birth_date", "status", "current_enrollment")
        read_only_fields = fields

    def get_current_enrollment(self, obj) -> dict | None:
        enr = current_enrollment(obj)
        return EnrollmentSerializer(enr).data if enr else None


CONTACT_FIELDS = ("address", "phone", "email", "national_student_no", "birth_place")


class StudentDetailSerializer(StudentListSerializer):
    username = serializers.CharField(source="user.username", read_only=True, default=None)

    class Meta(StudentListSerializer.Meta):
        fields = (
            *StudentListSerializer.Meta.fields,
            "birth_place",
            "address",
            "phone",
            "email",
            "admission_date",
            "photo_file",
            "username",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if self.context.get("limited"):
            for f in CONTACT_FIELDS:
                data.pop(f, None)
        return data


class StudentWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Student
        fields = ("full_name", "national_student_no", "birth_place", "birth_date", "gender", "address", "phone", "email", "admission_date")
        extra_kwargs = {"admission_date": {"required": False}}

    def validate_national_student_no(self, value):
        value = (value or "").strip() or None
        if value:
            qs = Student.objects.filter(national_student_no=value)
            if self.instance is not None:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError("Nomor induk nasional sudah dipakai siswa lain.")
        return value


class GuardianSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username", read_only=True, default=None)

    class Meta:
        model = Guardian
        fields = ("id", "full_name", "phone", "email", "address", "occupation", "active", "username")
        read_only_fields = ("id", "username")


class GuardianLinkSerializer(serializers.ModelSerializer):
    guardian = GuardianSerializer(read_only=True)

    class Meta:
        model = StudentGuardian
        fields = ("id", "guardian", "relationship", "is_primary", "receives_notifications", "financial_contact", "active")
        read_only_fields = fields


class GuardianLinkCreateSerializer(serializers.Serializer):
    guardian_id = serializers.PrimaryKeyRelatedField(queryset=Guardian.objects.filter(active=True), required=False, allow_null=True)
    guardian = GuardianSerializer(required=False)
    relationship = serializers.ChoiceField(choices=Relationship.choices)
    is_primary = serializers.BooleanField(default=False)
    receives_notifications = serializers.BooleanField(default=True)
    financial_contact = serializers.BooleanField(default=False)

    def validate(self, attrs):
        if not attrs.get("guardian_id") and not attrs.get("guardian"):
            raise serializers.ValidationError({"guardian_id": "Pilih wali yang ada atau isi data wali baru."})
        return attrs


class StudentCreateSerializer(StudentWriteSerializer):
    classroom = serializers.PrimaryKeyRelatedField(
        queryset=ClassRoom.objects.filter(active=True), required=False, allow_null=True, write_only=True
    )
    start_date = serializers.DateField(required=False, write_only=True)

    class Meta(StudentWriteSerializer.Meta):
        fields = (*StudentWriteSerializer.Meta.fields, "classroom", "start_date")


class EnrollSerializer(serializers.Serializer):
    classroom = serializers.PrimaryKeyRelatedField(queryset=ClassRoom.objects.filter(active=True))
    start_date = serializers.DateField(required=False)


class TransferSerializer(serializers.Serializer):
    classroom = serializers.PrimaryKeyRelatedField(queryset=ClassRoom.objects.filter(active=True))
    effective_date = serializers.DateField(required=False)
    reason = serializers.CharField(required=False, allow_blank=True, default="")


class StudentStatusChangeSerializer(serializers.Serializer):
    to_status = serializers.ChoiceField(choices=StudentStatus.choices)
    effective_date = serializers.DateField(required=False)
    reason = serializers.CharField(required=False, allow_blank=True, default="")
    destination = serializers.CharField(required=False, allow_blank=True, default="")
    document_file = serializers.PrimaryKeyRelatedField(queryset=StoredFile.objects.all(), required=False, allow_null=True)


class StatusHistorySerializer(serializers.ModelSerializer):
    changed_by_username = serializers.CharField(source="changed_by.username", read_only=True, default=None)

    class Meta:
        model = StudentStatusHistory
        fields = ("id", "from_status", "to_status", "effective_date", "reason", "changed_by_username", "created_at")
        read_only_fields = fields


class TransferRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = StudentTransfer
        fields = ("id", "transfer_type", "effective_date", "from_detail", "to_detail", "reason", "document_file", "created_at")
        read_only_fields = fields


class PortalAccountSerializer(serializers.Serializer):
    username = serializers.RegexField(r"^[a-zA-Z0-9._-]{3,150}$")
    password = serializers.CharField(trim_whitespace=False)


class PhotoSerializer(serializers.Serializer):
    file = serializers.PrimaryKeyRelatedField(queryset=StoredFile.objects.all())


class StudentDocumentFileSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    original_name = serializers.CharField()
    mime_type = serializers.CharField()
    size_bytes = serializers.IntegerField()


class StudentDocumentSerializer(serializers.Serializer):
    category = serializers.CharField()
    title = serializers.CharField()
    reference = serializers.CharField(allow_blank=True)
    date = serializers.DateTimeField()
    file = StudentDocumentFileSerializer()

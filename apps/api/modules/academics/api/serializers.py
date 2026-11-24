from rest_framework import serializers

from common.api.crud import ModelCleanSerializer

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


def _year_open(year):
    """PRD §18.2: configuration of a closed year is history and must not be edited."""
    if year is not None and year.status == AcademicYear.Status.CLOSED:
        raise serializers.ValidationError({"academic_year": "Tahun ajaran sudah ditutup; buat konfigurasi di tahun baru."})


class YearScopedSerializer(ModelCleanSerializer):
    def validate(self, attrs):
        year = attrs.get("academic_year") or getattr(self.instance, "academic_year", None)
        _year_open(year)
        if self.instance is not None and "academic_year" in attrs and attrs["academic_year"] != self.instance.academic_year:
            raise serializers.ValidationError({"academic_year": "Tahun ajaran tidak dapat dipindah."})
        return super().validate(attrs)


class TrimesterSerializer(YearScopedSerializer):
    class Meta:
        model = Trimester
        fields = (
            "id",
            "academic_year",
            "number",
            "name",
            "start_date",
            "end_date",
            "grade_entry_start",
            "grade_entry_end",
            "status",
            "cau_number",
            "updated_at",
        )
        read_only_fields = ("id", "status", "cau_number", "updated_at")
        extra_kwargs = {"name": {"required": False}}

    def validate(self, attrs):
        number = attrs.get("number", getattr(self.instance, "number", None))
        if self.instance is not None and "number" in attrs and attrs["number"] != self.instance.number:
            raise serializers.ValidationError({"number": "Nomor trimestre tidak dapat diubah."})
        if number is not None:
            attrs["cau_number"] = number  # ADR-005: CAU n belongs to Trimestre n
            attrs.setdefault("name", getattr(self.instance, "name", None) or f"Trimestre {number}")
        return super().validate(attrs)


class AcademicYearSerializer(ModelCleanSerializer):
    trimesters = TrimesterSerializer(many=True, read_only=True)

    class Meta:
        model = AcademicYear
        fields = ("id", "name", "start_date", "end_date", "status", "is_current", "trimesters", "updated_at")
        read_only_fields = ("id", "status", "is_current", "trimesters", "updated_at")

    def validate(self, attrs):
        if self.instance is not None and self.instance.status == AcademicYear.Status.CLOSED:
            raise serializers.ValidationError({"non_field_errors": ["Tahun ajaran sudah ditutup."]})
        attrs = super().validate(attrs)
        if self.instance is not None:
            start = attrs.get("start_date", self.instance.start_date)
            end = attrs.get("end_date", self.instance.end_date)
            if self.instance.trimesters.filter(start_date__lt=start).exists() or self.instance.trimesters.filter(end_date__gt=end).exists():
                raise serializers.ValidationError({"start_date": "Trimestre yang ada berada di luar rentang tanggal baru."})
        return attrs


class GradeLevelSerializer(ModelCleanSerializer):
    class Meta:
        model = GradeLevel
        fields = ("id", "code", "sequence", "active")
        read_only_fields = ("id", "code", "sequence")


class MajorSerializer(ModelCleanSerializer):
    class Meta:
        model = Major
        fields = ("id", "code", "name", "active")
        read_only_fields = ("id", "code")


class RoomSerializer(ModelCleanSerializer):
    class Meta:
        model = Room
        fields = ("id", "code", "name", "capacity", "room_type", "active")
        read_only_fields = ("id",)


class BellPeriodSerializer(ModelCleanSerializer):
    class Meta:
        model = BellPeriod
        fields = ("id", "name", "sequence", "start_time", "end_time", "active")
        read_only_fields = ("id",)


class CalendarEventSerializer(YearScopedSerializer):
    class Meta:
        model = SchoolCalendarEvent
        fields = ("id", "academic_year", "trimester", "event_type", "title", "start_at", "end_at", "affects_classes", "notes")
        read_only_fields = ("id",)


class SubjectSerializer(ModelCleanSerializer):
    class Meta:
        model = Subject
        fields = ("id", "code", "name", "short_name", "category", "active")
        read_only_fields = ("id",)


class SubjectOfferingSerializer(YearScopedSerializer):
    subject_code = serializers.CharField(source="subject.code", read_only=True)
    subject_name = serializers.CharField(source="subject.name", read_only=True)
    grade_level_code = serializers.CharField(source="grade_level.code", read_only=True)
    major_code = serializers.CharField(source="major.code", read_only=True, default=None)

    class Meta:
        model = SubjectOffering
        fields = (
            "id",
            "academic_year",
            "grade_level",
            "grade_level_code",
            "major",
            "major_code",
            "subject",
            "subject_code",
            "subject_name",
            "weekly_periods",
            "is_required",
            "active",
        )
        read_only_fields = ("id",)

    def validate(self, attrs):
        attrs = super().validate(attrs)
        major = attrs.get("major", getattr(self.instance, "major", None))
        qs = SubjectOffering.objects.filter(
            academic_year=attrs.get("academic_year", getattr(self.instance, "academic_year", None)),
            grade_level=attrs.get("grade_level", getattr(self.instance, "grade_level", None)),
            subject=attrs.get("subject", getattr(self.instance, "subject", None)),
            major=major,
        )
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError({"subject": "Mata pelajaran sudah ditawarkan untuk tingkat/jurusan ini."})
        return attrs


class ClassRoomSerializer(YearScopedSerializer):
    grade_level_code = serializers.CharField(source="grade_level.code", read_only=True)
    major_code = serializers.CharField(source="major.code", read_only=True)
    homeroom_teacher_name = serializers.CharField(source="homeroom_teacher.full_name", read_only=True, default=None)
    default_room_code = serializers.CharField(source="default_room.code", read_only=True, default=None)
    class_president_name = serializers.CharField(source="class_president.full_name", read_only=True, default=None)
    homeroom_teacher_phone = serializers.CharField(source="homeroom_teacher.phone", read_only=True, default=None)
    student_count = serializers.SerializerMethodField()

    class Meta:
        model = ClassRoom
        fields = (
            "id",
            "academic_year",
            "grade_level",
            "grade_level_code",
            "major",
            "major_code",
            "name",
            "code",
            "homeroom_teacher",
            "homeroom_teacher_name",
            "default_room",
            "default_room_code",
            "capacity",
            "class_president",
            "class_president_name",
            "homeroom_teacher_phone",
            "student_count",
            "active",
        )
        read_only_fields = ("id",)

    def get_student_count(self, obj) -> int:
        n = getattr(obj, "active_student_count", None)
        return n if n is not None else obj.enrollments.filter(status="ACTIVE").count()

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if self.instance is not None and hasattr(self.instance, "enrollments") and self.instance.enrollments.exists():
            for f in ("grade_level", "major"):
                if f in attrs and attrs[f] != getattr(self.instance, f):
                    raise serializers.ValidationError({f: "Rombel sudah memiliki siswa; tingkat/jurusan tidak dapat diubah (INV-08)."})
        teacher = attrs.get("homeroom_teacher")
        if teacher is not None and teacher.employment_status != "ACTIVE":
            raise serializers.ValidationError({"homeroom_teacher": "Guru tidak aktif."})
        return attrs


class TeachingAssignmentSerializer(YearScopedSerializer):
    teacher_name = serializers.CharField(source="teacher.full_name", read_only=True)
    classroom_name = serializers.CharField(source="classroom.name", read_only=True)
    subject_code = serializers.CharField(source="subject_offering.subject.code", read_only=True)
    subject_name = serializers.CharField(source="subject_offering.subject.name", read_only=True)

    class Meta:
        model = TeachingAssignment
        fields = (
            "id",
            "academic_year",
            "teacher",
            "teacher_name",
            "classroom",
            "classroom_name",
            "subject_offering",
            "subject_code",
            "subject_name",
            "valid_from",
            "valid_until",
            "active",
        )
        read_only_fields = ("id",)
        extra_kwargs = {"academic_year": {"required": False}}

    def validate(self, attrs):
        classroom = attrs.get("classroom") or getattr(self.instance, "classroom", None)
        if classroom is not None and "academic_year" not in attrs and self.instance is None:
            attrs["academic_year"] = classroom.academic_year
        teacher = attrs.get("teacher")
        if teacher is not None and teacher.employment_status != "ACTIVE":
            raise serializers.ValidationError({"teacher": "Guru tidak aktif."})
        attrs = super().validate(attrs)
        if attrs.get("active", getattr(self.instance, "active", True)):
            qs = TeachingAssignment.objects.filter(
                classroom=classroom,
                subject_offering=attrs.get("subject_offering", getattr(self.instance, "subject_offering", None)),
                active=True,
            )
            if self.instance is not None:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError({"subject_offering": "Mapel di rombel ini sudah memiliki guru aktif."})
        return attrs


class ReadinessCheckSerializer(serializers.Serializer):
    code = serializers.CharField()
    ok = serializers.BooleanField()
    detail = serializers.CharField()


class TrimesterTransitionSerializer(serializers.Serializer):
    target = serializers.ChoiceField(choices=[Trimester.Status.ACTIVE, Trimester.Status.GRADING, Trimester.Status.CLOSED])

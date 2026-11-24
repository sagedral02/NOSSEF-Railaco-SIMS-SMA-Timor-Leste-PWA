"""Academic master data (PRD §15.2–§15.8, §15.14–§15.17; ADR-005, ADR-007).

Invariants enforced in the database where possible:
- AcademicYear: start < end; at most one `is_current`.
- Trimester: number in 1..3, cau_number = number, unique per year, no overlapping date ranges (exclusion constraint).
- ClassRoom: unique code per year; one homeroom class per teacher per year.
- TeachingAssignment: one active teacher per classroom+offering.
Cross-table compatibility (year/grade/major) is checked in `clean()` and in services.
"""

from django.contrib.postgres.constraints import ExclusionConstraint
from django.contrib.postgres.fields import RangeOperators
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import F, Func, Q

from common.models import BaseModel


class DateRange(Func):
    function = "daterange"
    output_field = models.Field()


class AcademicYear(BaseModel):
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        ACTIVE = "ACTIVE", "Active"
        CLOSED = "CLOSED", "Closed"

    name = models.CharField(max_length=30, unique=True)
    start_date = models.DateField()
    end_date = models.DateField()
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    is_current = models.BooleanField(default=False)

    class Meta:
        ordering = ("-start_date",)
        constraints = [
            models.CheckConstraint(condition=Q(start_date__lt=F("end_date")), name="academics_year_dates_ordered"),
            models.UniqueConstraint(fields=["is_current"], condition=Q(is_current=True), name="academics_year_single_current"),
            models.UniqueConstraint(fields=["status"], condition=Q(status="ACTIVE"), name="academics_year_single_active"),
        ]
        indexes = [models.Index(fields=["status"]), models.Index(fields=["start_date"])]

    def __str__(self):
        return self.name


class Trimester(BaseModel):
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        ACTIVE = "ACTIVE", "Active"
        GRADING = "GRADING", "Grading"
        CLOSED = "CLOSED", "Closed"

    academic_year = models.ForeignKey(AcademicYear, on_delete=models.PROTECT, related_name="trimesters")
    number = models.PositiveSmallIntegerField()
    name = models.CharField(max_length=50)
    start_date = models.DateField()
    end_date = models.DateField()
    grade_entry_start = models.DateTimeField(null=True, blank=True)
    grade_entry_end = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    cau_number = models.PositiveSmallIntegerField()

    class Meta:
        ordering = ("academic_year", "number")
        constraints = [
            models.UniqueConstraint(fields=["academic_year", "number"], name="academics_trimester_unique_number"),
            models.CheckConstraint(condition=Q(number__gte=1, number__lte=3), name="academics_trimester_number_1_3"),
            models.CheckConstraint(condition=Q(cau_number=F("number")), name="academics_trimester_cau_equals_number"),
            models.CheckConstraint(condition=Q(start_date__lte=F("end_date")), name="academics_trimester_dates_ordered"),
            models.CheckConstraint(
                condition=Q(grade_entry_start__isnull=True)
                | Q(grade_entry_end__isnull=True)
                | Q(grade_entry_start__lt=F("grade_entry_end")),
                name="academics_trimester_grade_window_ordered",
            ),
            ExclusionConstraint(
                name="academics_trimester_no_overlap",
                expressions=[
                    (F("academic_year"), RangeOperators.EQUAL),
                    (DateRange("start_date", "end_date", models.Value("[]")), RangeOperators.OVERLAPS),
                ],
            ),
            models.UniqueConstraint(fields=["academic_year"], condition=Q(status="ACTIVE"), name="academics_trimester_single_active"),
        ]
        indexes = [models.Index(fields=["status"])]

    def __str__(self):
        return f"{self.academic_year.name} — {self.name}"

    def clean(self):
        errors = {}
        if self.number and self.cau_number and self.cau_number != self.number:
            errors["cau_number"] = "Nomor CAU harus sama dengan nomor trimestre."
        year = self.academic_year if self.academic_year_id else None
        if year and self.start_date and self.end_date:
            if self.start_date < year.start_date or self.end_date > year.end_date:
                errors["start_date"] = "Tanggal trimestre harus berada di dalam tahun ajaran."
        if errors:
            raise ValidationError(errors)


class GradeLevel(BaseModel):
    code = models.CharField(max_length=4, unique=True)
    sequence = models.PositiveSmallIntegerField(unique=True)
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ("sequence",)
        indexes = [models.Index(fields=["sequence"])]

    def __str__(self):
        return self.code


class Major(BaseModel):
    code = models.CharField(max_length=10, unique=True)
    name = models.CharField(max_length=100)
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ("code",)

    def __str__(self):
        return self.code


class Room(BaseModel):
    class RoomType(models.TextChoices):
        CLASSROOM = "CLASSROOM", "Classroom"
        LAB = "LAB", "Lab"
        LIBRARY = "LIBRARY", "Library"
        HALL = "HALL", "Hall"
        OTHER = "OTHER", "Other"

    code = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=100)
    capacity = models.PositiveIntegerField(null=True, blank=True)
    room_type = models.CharField(max_length=10, choices=RoomType.choices, default=RoomType.CLASSROOM)
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ("code",)
        indexes = [models.Index(fields=["active"]), models.Index(fields=["room_type"])]

    def __str__(self):
        return self.code


class BellPeriod(BaseModel):
    name = models.CharField(max_length=50)
    sequence = models.PositiveSmallIntegerField()
    start_time = models.TimeField()
    end_time = models.TimeField()
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ("sequence",)
        constraints = [
            models.CheckConstraint(condition=Q(start_time__lt=F("end_time")), name="academics_bell_times_ordered"),
            models.UniqueConstraint(fields=["sequence"], condition=Q(active=True), name="academics_bell_unique_active_sequence"),
        ]
        indexes = [models.Index(fields=["sequence"])]

    def __str__(self):
        return self.name


class SchoolCalendarEvent(BaseModel):
    class EventType(models.TextChoices):
        HOLIDAY = "HOLIDAY", "Holiday"
        EXAM = "EXAM", "Exam"
        EVENT = "EVENT", "Event"
        DEADLINE = "DEADLINE", "Deadline"
        OTHER = "OTHER", "Other"

    academic_year = models.ForeignKey(AcademicYear, on_delete=models.PROTECT, related_name="calendar_events")
    trimester = models.ForeignKey(Trimester, null=True, blank=True, on_delete=models.PROTECT, related_name="calendar_events")
    event_type = models.CharField(max_length=10, choices=EventType.choices)
    title = models.CharField(max_length=200)
    start_at = models.DateField()
    end_at = models.DateField()
    affects_classes = models.BooleanField(default=False)
    notes = models.TextField(blank=True, default="")

    class Meta:
        ordering = ("start_at",)
        constraints = [models.CheckConstraint(condition=Q(end_at__gte=F("start_at")), name="academics_event_dates_ordered")]
        indexes = [models.Index(fields=["academic_year", "event_type"]), models.Index(fields=["start_at"])]

    def __str__(self):
        return self.title

    def clean(self):
        if self.trimester_id and self.academic_year_id and self.trimester.academic_year_id != self.academic_year_id:
            raise ValidationError({"trimester": "Trimestre bukan bagian dari tahun ajaran ini."})


class Subject(BaseModel):
    class Category(models.TextChoices):
        CORE = "CORE", "Core"
        MAJOR = "MAJOR", "Major"
        ELECTIVE = "ELECTIVE", "Elective"
        OTHER = "OTHER", "Other"

    code = models.CharField(max_length=30, unique=True)
    name = models.CharField(max_length=150)
    short_name = models.CharField(max_length=30, blank=True, default="")
    category = models.CharField(max_length=10, choices=Category.choices, default=Category.CORE)
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ("code",)
        indexes = [models.Index(fields=["category"]), models.Index(fields=["active"])]

    def __str__(self):
        return f"{self.code} — {self.name}"


class SubjectOffering(BaseModel):
    academic_year = models.ForeignKey(AcademicYear, on_delete=models.PROTECT, related_name="subject_offerings")
    grade_level = models.ForeignKey(GradeLevel, on_delete=models.PROTECT, related_name="subject_offerings")
    major = models.ForeignKey(Major, null=True, blank=True, on_delete=models.PROTECT, related_name="subject_offerings")
    subject = models.ForeignKey(Subject, on_delete=models.PROTECT, related_name="offerings")
    weekly_periods = models.PositiveSmallIntegerField()
    is_required = models.BooleanField(default=True)
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ("academic_year", "grade_level__sequence", "subject__code")
        constraints = [
            models.UniqueConstraint(
                fields=["academic_year", "grade_level", "major", "subject"], name="academics_offering_unique", nulls_distinct=False
            ),
            models.CheckConstraint(condition=Q(weekly_periods__gt=0), name="academics_offering_weekly_positive"),
        ]
        indexes = [models.Index(fields=["academic_year", "grade_level", "major"])]

    def __str__(self):
        return f"{self.subject.code} {self.grade_level.code} {self.major.code if self.major_id else '*'} ({self.academic_year.name})"

    def applies_to(self, classroom):
        return (
            self.academic_year_id == classroom.academic_year_id
            and self.grade_level_id == classroom.grade_level_id
            and (self.major_id is None or self.major_id == classroom.major_id)
        )


class ClassRoom(BaseModel):
    academic_year = models.ForeignKey(AcademicYear, on_delete=models.PROTECT, related_name="classrooms")
    grade_level = models.ForeignKey(GradeLevel, on_delete=models.PROTECT, related_name="classrooms")
    major = models.ForeignKey(Major, on_delete=models.PROTECT, related_name="classrooms")
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=50)
    homeroom_teacher = models.ForeignKey("staff.Teacher", null=True, blank=True, on_delete=models.PROTECT, related_name="homeroom_classes")
    default_room = models.ForeignKey(Room, null=True, blank=True, on_delete=models.PROTECT, related_name="classrooms")
    capacity = models.PositiveIntegerField(null=True, blank=True)
    # Ketua kelas / Chefe de Turma (ui.md SCREEN-05/07); must be actively enrolled in this class.
    class_president = models.ForeignKey("students.Student", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ("academic_year", "grade_level__sequence", "code")
        constraints = [
            models.UniqueConstraint(fields=["academic_year", "code"], name="academics_classroom_unique_code"),
            models.UniqueConstraint(
                fields=["academic_year", "homeroom_teacher"],
                condition=Q(homeroom_teacher__isnull=False),
                name="academics_classroom_single_homeroom",
            ),
        ]
        indexes = [models.Index(fields=["academic_year", "grade_level", "major"]), models.Index(fields=["homeroom_teacher"])]

    def __str__(self):
        return self.name

    def clean(self):
        super().clean()
        if self.class_president_id and (
            self.pk is None or not self.enrollments.filter(student_id=self.class_president_id, status="ACTIVE").exists()
        ):
            raise ValidationError({"class_president": "Ketua kelas harus siswa aktif di rombel ini."})


class TeachingAssignment(BaseModel):
    academic_year = models.ForeignKey(AcademicYear, on_delete=models.PROTECT, related_name="teaching_assignments")
    teacher = models.ForeignKey("staff.Teacher", on_delete=models.PROTECT, related_name="teaching_assignments")
    classroom = models.ForeignKey(ClassRoom, on_delete=models.PROTECT, related_name="teaching_assignments")
    subject_offering = models.ForeignKey(SubjectOffering, on_delete=models.PROTECT, related_name="teaching_assignments")
    valid_from = models.DateField(null=True, blank=True)
    valid_until = models.DateField(null=True, blank=True)
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ("classroom__code", "subject_offering__subject__code")
        constraints = [
            models.UniqueConstraint(
                fields=["classroom", "subject_offering"], condition=Q(active=True), name="academics_assignment_single_active"
            ),
            models.CheckConstraint(
                condition=Q(valid_until__isnull=True) | Q(valid_from__isnull=True) | Q(valid_until__gte=F("valid_from")),
                name="academics_assignment_dates_ordered",
            ),
        ]
        indexes = [models.Index(fields=["teacher", "active"]), models.Index(fields=["classroom", "active"])]

    def __str__(self):
        return f"{self.teacher} → {self.classroom} {self.subject_offering.subject.code}"

    def clean(self):
        errors = {}
        if self.classroom_id and self.academic_year_id and self.classroom.academic_year_id != self.academic_year_id:
            errors["classroom"] = "Rombel bukan bagian dari tahun ajaran ini."
        if self.classroom_id and self.subject_offering_id and not self.subject_offering.applies_to(self.classroom):
            errors["subject_offering"] = "Mata pelajaran ini tidak berlaku untuk tingkat/jurusan rombel."
        if errors:
            raise ValidationError(errors)

"""Recurring timetable and one-date exceptions (PRD §15.29–§15.30, §19)."""

from django.db import models
from django.db.models import F, Q

from common.models import BaseModel


class ScheduleEntry(BaseModel):
    academic_year = models.ForeignKey("academics.AcademicYear", on_delete=models.PROTECT, related_name="schedule_entries")
    trimester = models.ForeignKey("academics.Trimester", null=True, blank=True, on_delete=models.PROTECT, related_name="schedule_entries")
    classroom = models.ForeignKey("academics.ClassRoom", on_delete=models.PROTECT, related_name="schedule_entries")
    teaching_assignment = models.ForeignKey("academics.TeachingAssignment", on_delete=models.PROTECT, related_name="schedule_entries")
    weekday = models.PositiveSmallIntegerField()  # ISO 1=Monday … 7=Sunday
    bell_period = models.ForeignKey("academics.BellPeriod", on_delete=models.PROTECT, related_name="schedule_entries")
    room = models.ForeignKey("academics.Room", null=True, blank=True, on_delete=models.PROTECT, related_name="schedule_entries")
    valid_from = models.DateField()
    valid_until = models.DateField(null=True, blank=True)
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ("weekday", "bell_period__sequence")
        constraints = [
            models.CheckConstraint(condition=Q(weekday__gte=1, weekday__lte=7), name="schedules_weekday_1_7"),
            models.CheckConstraint(
                condition=Q(valid_until__isnull=True) | Q(valid_until__gte=F("valid_from")), name="schedules_valid_range"
            ),
        ]
        indexes = [
            models.Index(fields=["classroom", "weekday", "bell_period"]),
            models.Index(fields=["teaching_assignment", "weekday"]),
            models.Index(fields=["room", "weekday"]),
        ]

    def __str__(self):
        return f"{self.classroom} D{self.weekday} {self.bell_period}"

    def covers(self, date):
        return (
            self.active
            and self.valid_from <= date
            and (self.valid_until is None or date <= self.valid_until)
            and date.isoweekday() == self.weekday
        )


class ScheduleException(BaseModel):
    class Type(models.TextChoices):
        CANCELLED = "CANCELLED", "Cancelled"
        MOVED = "MOVED", "Moved"
        SUBSTITUTED = "SUBSTITUTED", "Substituted"

    schedule_entry = models.ForeignKey(ScheduleEntry, on_delete=models.PROTECT, related_name="exceptions")
    date = models.DateField()
    exception_type = models.CharField(max_length=12, choices=Type.choices)
    new_bell_period = models.ForeignKey("academics.BellPeriod", null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    new_room = models.ForeignKey("academics.Room", null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    substitute_teacher = models.ForeignKey("staff.Teacher", null=True, blank=True, on_delete=models.PROTECT, related_name="substitutions")
    reason = models.TextField()

    class Meta:
        ordering = ("-date",)
        constraints = [
            models.UniqueConstraint(fields=["schedule_entry", "date"], name="schedules_exception_unique_date"),
            models.CheckConstraint(condition=~Q(reason=""), name="schedules_exception_reason_required"),
            models.CheckConstraint(
                condition=~Q(exception_type="SUBSTITUTED") | Q(substitute_teacher__isnull=False), name="schedules_substitute_required"
            ),
        ]
        indexes = [models.Index(fields=["date"]), models.Index(fields=["exception_type"])]

    def __str__(self):
        return f"{self.schedule_entry_id} {self.date} {self.exception_type}"

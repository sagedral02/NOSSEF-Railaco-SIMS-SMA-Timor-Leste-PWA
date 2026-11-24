"""Synthetic weekly timetable for the demo year (greedy, collision-free)."""

import random

from django.db import transaction

from modules.academics.models import AcademicYear, BellPeriod, TeachingAssignment

from .models import ScheduleEntry


@transaction.atomic
def seed_demo_schedules():
    year = AcademicYear.objects.filter(name="2026").first()
    if year is None or ScheduleEntry.objects.filter(academic_year=year).exists():
        return {"skipped": True}
    rng = random.Random(19)
    bells = list(BellPeriod.objects.filter(active=True).order_by("sequence"))
    slots = [(d, b) for d in range(1, 7) for b in bells]
    teacher_busy, class_busy = set(), set()
    created = skipped = 0
    assignments = list(
        TeachingAssignment.objects.filter(academic_year=year, active=True).select_related("classroom", "subject_offering", "teacher")
    )
    assignments.sort(key=lambda a: (-a.subject_offering.weekly_periods, a.classroom.code))
    for ta in assignments:
        order = slots[:]
        rng.shuffle(order)
        need = ta.subject_offering.weekly_periods
        for day, bell in order:
            if need == 0:
                break
            if (ta.teacher_id, day, bell.pk) in teacher_busy or (ta.classroom_id, day, bell.pk) in class_busy:
                continue
            ScheduleEntry.objects.create(
                academic_year=year,
                classroom=ta.classroom,
                teaching_assignment=ta,
                weekday=day,
                bell_period=bell,
                room=ta.classroom.default_room,
                valid_from=year.start_date,
            )
            teacher_busy.add((ta.teacher_id, day, bell.pk))
            class_busy.add((ta.classroom_id, day, bell.pk))
            need -= 1
            created += 1
        skipped += need
    return {"entries": created, "unplaced_periods": skipped}

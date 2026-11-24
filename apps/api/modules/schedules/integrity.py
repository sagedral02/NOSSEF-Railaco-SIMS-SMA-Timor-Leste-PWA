"""INT-008: no active teacher/class/room collisions in recurring schedules."""

from django.db.models import Count

from .models import ScheduleEntry


def int_008_no_schedule_collisions():
    active = ScheduleEntry.objects.filter(active=True, valid_until__isnull=True)
    teacher = active.values("teaching_assignment__teacher", "weekday", "bell_period").annotate(n=Count("id")).filter(n__gt=1).count()
    klass = active.values("classroom", "weekday", "bell_period").annotate(n=Count("id")).filter(n__gt=1).count()
    room = active.exclude(room=None).values("room", "weekday", "bell_period").annotate(n=Count("id")).filter(n__gt=1).count()
    return "INT-008", teacher + klass + room == 0, f"teacher={teacher} class={klass} room={room} collisions (open-ended entries)"

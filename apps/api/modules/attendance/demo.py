"""Synthetic attendance history (daily sessions, last 15 school days) so summaries/reports have data."""

import random
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from modules.academics.models import AcademicYear, ClassRoom
from modules.accounts.models import User

from . import services
from .models import AttendanceSession


@transaction.atomic
def seed_demo_attendance():
    year = AcademicYear.objects.filter(name="2026").first()
    if year is None or AttendanceSession.objects.exists():
        return {"skipped": True}
    rng = random.Random(7)
    admin = User.objects.get(username="admin")
    today = timezone.localdate()
    days, d = [], today - timedelta(days=1)
    while len(days) < 15:
        if d.isoweekday() <= 6 and year.start_date <= d:
            days.append(d)
        d -= timedelta(days=1)
    n = 0
    for cls in ClassRoom.objects.filter(academic_year=year):
        for day in sorted(days):
            try:
                session, _ = services.open_session(actor=admin, classroom=cls, date=day, session_type="DAILY")
            except Exception:  # noqa: BLE001 - outside an active trimester
                continue
            items = []
            for st in services.roster(cls, day):
                r = rng.random()
                status = "PRESENT" if r < 0.9 else "LATE" if r < 0.94 else "SICK" if r < 0.97 else "PERMITTED" if r < 0.985 else "ABSENT"
                items.append({"student_id": st.pk, "status": status, "minutes_late": rng.randint(5, 25) if status == "LATE" else None})
            services.set_records(actor=admin, session=session, items=items)
            services.submit(actor=admin, session=session)
            n += 1
    return {"daily_sessions": n}

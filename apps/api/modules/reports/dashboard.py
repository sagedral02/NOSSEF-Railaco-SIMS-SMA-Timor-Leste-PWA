"""Role dashboards (PRD §33.1–§33.2): derived, permission-scoped aggregates with drill-down links, cached briefly per user.
Every widget declares its period/context and never counts students outside the actor's scope."""

from datetime import timedelta

from django.core.cache import cache
from django.db.models import Count, Q, Sum
from django.utils import timezone

from common.permissions import user_has_global, user_has_perm


def _usd(v):
    return f"${(v or 0):,.2f}"


def _w(key, value, *, href=None, sub=None, tone=None, context=None):
    return {"key": key, "value": value, "href": href, "sub": sub, "tone": tone, "context": context}


def _current():
    from modules.academics.models import AcademicYear

    year = AcademicYear.objects.filter(is_current=True).first()
    tri = year.trimesters.filter(status__in=["ACTIVE", "GRADING"]).order_by("-number").first() if year else None
    return year, tri


def _students_section(year):
    from modules.students.models import Student, StudentEnrollment

    active = Student.objects.filter(status="ACTIVE")
    enrolled = StudentEnrollment.objects.filter(academic_year=year, status="ACTIVE").values("student_id")
    missing = active.exclude(pk__in=enrolled).count()
    since = timezone.now() - timedelta(days=30)
    from modules.students.models import StudentTransfer

    return [
        _w("dash.activeStudents", active.count(), href="/students", context=year.name if year else None),
        _w("dash.noEnrollment", missing, href="/students?no_enrollment=1", tone="bad" if missing else "ok"),
        _w("dash.transfers30", StudentTransfer.objects.filter(created_at__gte=since).count(), href="/students", context="30d"),
    ]


def _attendance_section(user, year):
    from modules.attendance.models import AttendanceRecord, AttendanceSession

    today = timezone.localdate()
    sessions = AttendanceSession.objects.filter(date=today, session_type="DAILY")
    submitted = sessions.filter(status__in=["SUBMITTED", "LOCKED"]).count()
    from modules.academics.models import ClassRoom

    classes = ClassRoom.objects.filter(academic_year=year, active=True).count() if year else 0
    recs = AttendanceRecord.objects.filter(
        session__session_type="DAILY", session__status__in=["SUBMITTED", "LOCKED"], session__date__gte=today - timedelta(days=30)
    )
    agg = recs.aggregate(total=Count("id"), ok=Count("id", filter=Q(status__in=["PRESENT", "LATE"])))
    rate = round(agg["ok"] * 100 / agg["total"], 1) if agg["total"] else None
    absent_today = AttendanceRecord.objects.filter(session__date=today, status="ABSENT").values("student_id").distinct().count()
    return [
        _w(
            "dash.attendanceRate",
            f"{rate}%" if rate is not None else "—",
            href="/attendance/review",
            context="30d",
            tone="ok" if (rate or 0) >= 90 else "bad",
        ),
        _w(
            "dash.dailySubmitted",
            f"{submitted}/{classes}",
            href="/attendance/review",
            context=str(today),
            tone="ok" if classes and submitted >= classes else None,
        ),
        _w("dash.absentToday", absent_today, href="/attendance/review", context=str(today), tone="bad" if absent_today else None),
    ]


def _teacher_section(user):
    from modules.academics.selectors import teacher_of
    from modules.assessments.models import Assessment, StudentScore
    from modules.attendance.models import AttendanceSession
    from modules.schedules.models import ScheduleEntry

    t = teacher_of(user)
    if t is None:
        return []
    today = timezone.localdate()
    lessons = (
        ScheduleEntry.objects.filter(teaching_assignment__teacher=t, weekday=today.isoweekday(), active=True, valid_from__lte=today)
        .filter(Q(valid_until__isnull=True) | Q(valid_until__gte=today))
        .count()
    )
    done = AttendanceSession.objects.filter(teaching_assignment__teacher=t, date=today, status__in=["SUBMITTED", "LOCKED"]).count()
    open_assess = Assessment.objects.filter(teaching_assignment__teacher=t, status="OPEN")
    missing = 0
    for a in open_assess.select_related("teaching_assignment", "trimester")[:30]:
        from modules.assessments.services import roster

        expected = roster(a.teaching_assignment, a.trimester).count()
        missing += max(0, expected - StudentScore.objects.filter(assessment=a).exclude(status="PENDING").count())
    return [
        _w("dash.lessonsToday", lessons, href="/schedules", context=str(today)),
        _w("dash.pendingAttendance", max(0, lessons - done), href="/attendance/today", tone="bad" if lessons > done else "ok"),
        _w("dash.openAssessments", open_assess.count(), href="/grades/gradebook"),
        _w("dash.missingScores", missing, href="/grades/gradebook", tone="bad" if missing else "ok"),
    ]


def _grades_section(user, tri):
    if tri is None:
        return []
    from modules.academics.selectors import homeroom_classroom_ids
    from modules.assessments.services import completion
    from modules.report_cards.models import ReportCard

    scope = None if user_has_global(user, "assessment.view") else homeroom_classroom_ids(user)
    rows = completion(tri, scope)
    exp = sum(r["expected"] for r in rows)
    fin = sum(r["finalized"] for r in rows)
    no_scheme = sum(1 for r in rows if not r["has_scheme"])
    rc = ReportCard.objects.filter(trimester=tri)
    if scope is not None:
        rc = rc.filter(enrollment__classroom_id__in=scope)
    return [
        _w(
            "dash.gradeCompletion",
            f"{round(fin * 100 / exp, 1) if exp else 0}%",
            href="/grades/completion",
            context=tri.name,
            sub=f"{fin}/{exp}",
        ),
        _w("dash.missingSchemes", no_scheme, href="/grades/completion", tone="bad" if no_scheme else "ok", context=tri.name),
        _w(
            "dash.reportsPublished",
            rc.filter(status="PUBLISHED").count(),
            href="/reports/report-cards",
            context=tri.name,
            sub=f"{rc.count()}",
        ),
    ]


def _finance_section(year):
    from modules.finance.models import Invoice, Payment

    today = timezone.localdate()
    inv = Invoice.objects.filter(academic_year=year).exclude(status="VOID")
    tot = inv.aggregate(t=Sum("total"), p=Sum("paid_amount"), b=Sum("balance"))
    month = Payment.objects.filter(status="VERIFIED", verified_at__date__gte=today.replace(day=1)).aggregate(s=Sum("amount"))["s"]
    todays = Payment.objects.filter(status="VERIFIED", verified_at__date=today).aggregate(s=Sum("amount"), n=Count("id"))
    overdue = inv.filter(status__in=["UNPAID", "PARTIALLY_PAID"], due_date__lt=today).aggregate(b=Sum("balance"))["b"]
    pending = Payment.objects.filter(status="PENDING").count()
    rate = round(float(tot["p"] or 0) * 100 / float(tot["t"]), 1) if tot["t"] else 0
    return [
        _w("dash.paymentsToday", _usd(todays["s"]), href="/finance/payments", sub=str(todays["n"]), context=str(today)),
        _w("dash.collectionMonth", _usd(month), href="/finance", context=today.strftime("%Y-%m")),
        _w("dash.collectionRate", f"{rate}%", href="/finance", context=year.name if year else None),
        _w("dash.overdue", _usd(overdue), href="/finance/arrears", tone="bad" if overdue else "ok"),
        _w("dash.pendingVerify", pending, href="/finance/payments?status=PENDING", tone="bad" if pending else "ok"),
    ]


def _admission_section():
    from modules.admissions.models import Applicant

    rows = dict(Applicant.objects.filter(admission_period__status="OPEN").values_list("status").annotate(n=Count("id")))
    return [
        _w("dash.applicants", sum(rows.values()), href="/admissions/applicants"),
        _w(
            "dash.applicantsToVerify",
            rows.get("SUBMITTED", 0),
            href="/admissions/applicants?status=SUBMITTED",
            tone="bad" if rows.get("SUBMITTED") else None,
        ),
    ]


def _counseling_section(user):
    from modules.counseling.models import CounselingCase, CounselingFollowUp

    open_cases = CounselingCase.objects.filter(status__in=["OPEN", "IN_PROGRESS"])
    mine = open_cases.filter(assigned_counselor=user).count()
    due = CounselingFollowUp.objects.filter(
        case__in=open_cases, next_action_at__lte=timezone.now() + timedelta(days=2), next_action_at__isnull=False
    ).count()
    return [
        _w("dash.openCases", open_cases.count(), href="/counseling", sub=str(mine)),
        _w("dash.followUpsDue", due, href="/counseling", tone="bad" if due else "ok", context="48h"),
    ]


def _library_section():
    from modules.library.models import LibraryCopy, LibraryLoan
    from modules.library.services import refresh_overdue

    refresh_overdue()
    return [
        _w("dash.openLoans", LibraryLoan.objects.filter(status__in=["OPEN", "OVERDUE"]).count(), href="/library"),
        _w("dash.overdueLoans", LibraryLoan.objects.filter(status="OVERDUE").count(), href="/library", tone="bad"),
        _w("dash.damagedCopies", LibraryCopy.objects.filter(status__in=["LOST", "DAMAGED"]).count(), href="/library"),
    ]


def _exam_section(year):
    from modules.national_exams.models import NationalExamRecord

    rows = dict(NationalExamRecord.objects.filter(academic_year=year).values_list("status").annotate(n=Count("id")))
    return [_w("dash.nationalExams", sum(rows.values()), href="/national-exams", sub=f"{rows.get('PASSED', 0)} PASSED")]


def _portal_children(user):
    from modules.attendance.services import student_summary
    from modules.finance.models import Invoice
    from modules.report_cards.models import ReportCard
    from modules.students.models import Student

    out = []
    for s in (
        Student.objects.filter(Q(user=user) | Q(guardian_links__guardian__user=user, guardian_links__active=True))
        .distinct()
        .order_by("full_name")[:10]
    ):
        att = student_summary(s)
        latest = (
            ReportCard.objects.filter(student=s, status="PUBLISHED")
            .select_related("trimester__academic_year")
            .order_by("-published_at")
            .first()
        )
        bal = Invoice.objects.filter(student=s, status__in=["UNPAID", "PARTIALLY_PAID"]).aggregate(b=Sum("balance"))["b"]
        enr = s.enrollments.filter(status="ACTIVE").select_related("classroom").first()
        out.append(
            {
                "id": str(s.pk),
                "full_name": s.full_name,
                "student_no": s.student_no,
                "classroom": enr.classroom.name if enr else None,
                "attendance_rate": att["attendance_rate"],
                "outstanding": str(bal or "0.00"),
                "latest_report": {
                    "id": str(latest.pk),
                    "label": f"{latest.trimester.academic_year.name} T{latest.trimester.number}",
                    "average": latest.snapshot.get("average"),
                }
                if latest
                else None,
            }
        )
    return out


def build(user):
    key = f"dash:{user.pk}"
    if (hit := cache.get(key)) is not None:
        return hit
    year, tri = _current()
    sections = []
    if user_has_global(user, "student.view"):
        sections.append({"key": "dash.sec.students", "widgets": _students_section(year)})
    if user_has_global(user, "attendance.view"):
        sections.append({"key": "dash.sec.attendance", "widgets": _attendance_section(user, year)})
    if user_has_perm(user, "attendance.record") or user_has_perm(user, "score.record"):
        if w := _teacher_section(user):
            sections.append({"key": "dash.sec.teaching", "widgets": w})
    if user_has_perm(user, "assessment.view") and (user_has_global(user, "assessment.view") or user_has_perm(user, "report.view")):
        sections.append({"key": "dash.sec.grades", "widgets": _grades_section(user, tri)})
    if user_has_global(user, "finance.view"):
        sections.append({"key": "dash.sec.finance", "widgets": _finance_section(year)})
    if user_has_global(user, "admission.view"):
        sections.append({"key": "dash.sec.admissions", "widgets": _admission_section()})
    if user_has_global(user, "counseling.view"):
        sections.append({"key": "dash.sec.counseling", "widgets": _counseling_section(user)})
    if user_has_global(user, "library.view") and user_has_perm(user, "library.issue"):
        sections.append({"key": "dash.sec.library", "widgets": _library_section()})
    if user_has_global(user, "report.view") and year:
        sections.append({"key": "dash.sec.exams", "widgets": _exam_section(year)})
    data = {
        "academic_year": year.name if year else None,
        "trimester": tri.name if tri else None,
        "generated_at": timezone.now().isoformat(),
        "sections": [s for s in sections if s["widgets"]],
        "children": _portal_children(user),
    }
    cache.set(key, data, 60)
    return data

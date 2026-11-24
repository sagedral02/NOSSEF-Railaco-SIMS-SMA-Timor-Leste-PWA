"""Academic-year lifecycle and readiness gate (PRD §18.1, F2-11)."""

from django.db import transaction

from common.api.exceptions import ConflictError, DomainError, ErrorCode
from modules.audit import services as audit
from modules.audit.events import AuditEvent

from .models import AcademicYear, BellPeriod, ClassRoom, GradeLevel, Major, SubjectOffering, TeachingAssignment, Trimester

REQUIRED_GRADES = {"X", "XI", "XII"}
REQUIRED_MAJORS = {"IPA", "IPS"}


def readiness(year):
    """Return the §18.1 activation checklist as a list of {code, ok, detail}."""
    trimesters = list(year.trimesters.order_by("number"))
    numbers = [t.number for t in trimesters]
    classrooms = ClassRoom.objects.filter(academic_year=year, active=True)
    offerings = SubjectOffering.objects.filter(academic_year=year, active=True)
    unassigned = 0
    for classroom in classrooms.select_related("grade_level", "major"):
        applicable = [o for o in offerings if o.applies_to(classroom)]
        assigned = set(TeachingAssignment.objects.filter(classroom=classroom, active=True).values_list("subject_offering_id", flat=True))
        unassigned += sum(1 for o in applicable if o.id not in assigned)
    overlap = any(a.end_date >= b.start_date for a, b in zip(trimesters, trimesters[1:], strict=False))
    inside = all(year.start_date <= t.start_date and t.end_date <= year.end_date for t in trimesters)
    checks = [
        ("dates_valid", year.start_date < year.end_date, f"{year.start_date} – {year.end_date}"),
        ("three_trimesters", numbers == [1, 2, 3], f"trimestre: {numbers}"),
        ("trimesters_non_overlapping", not overlap and inside, "tidak tumpang tindih & di dalam tahun ajaran"),
        ("cau_mapping", all(t.cau_number == t.number for t in trimesters) and len(trimesters) == 3, "CAU n = Trimestre n"),
        ("grade_levels_seeded", REQUIRED_GRADES <= set(GradeLevel.objects.filter(active=True).values_list("code", flat=True)), "X/XI/XII"),
        ("majors_seeded", REQUIRED_MAJORS <= set(Major.objects.filter(active=True).values_list("code", flat=True)), "IPA/IPS"),
        (
            "bell_periods",
            BellPeriod.objects.filter(active=True).exists(),
            f"{BellPeriod.objects.filter(active=True).count()} jam pelajaran",
        ),
        ("classrooms", classrooms.exists(), f"{classrooms.count()} rombel"),
        ("subject_offerings", offerings.exists(), f"{offerings.count()} penawaran mapel"),
        ("teaching_assignments", classrooms.exists() and unassigned == 0, f"{unassigned} mapel rombel belum punya guru"),
    ]
    return [{"code": c, "ok": bool(ok), "detail": d} for c, ok, d in checks]


@transaction.atomic
def activate_year(*, actor, year):
    year = AcademicYear.objects.select_for_update().get(pk=year.pk)
    if year.status != AcademicYear.Status.DRAFT:
        raise ConflictError(ErrorCode.INVALID_STATE_TRANSITION, f"Tahun ajaran berstatus {year.status}.")
    if AcademicYear.objects.filter(status=AcademicYear.Status.ACTIVE).exclude(pk=year.pk).exists():
        raise ConflictError(ErrorCode.INVALID_STATE_TRANSITION, "Tutup tahun ajaran aktif sebelumnya terlebih dahulu.")
    checks = readiness(year)
    failed = [c for c in checks if not c["ok"]]
    if failed:
        code = (
            ErrorCode.TRIMESTER_COUNT_INVALID if any(c["code"] == "three_trimesters" for c in failed) else ErrorCode.ACADEMIC_YEAR_NOT_READY
        )
        raise DomainError(code, "Tahun ajaran belum siap diaktifkan.", status_code=409, details={"checks": checks})
    AcademicYear.objects.filter(is_current=True).update(is_current=False)
    year.status = AcademicYear.Status.ACTIVE
    year.is_current = True
    year.save(update_fields=["status", "is_current", "updated_at"])
    audit.record(AuditEvent.ACADEMIC_YEAR_ACTIVATED, actor=actor, resource=year, after={"status": year.status})
    return year


@transaction.atomic
def close_year(*, actor, year):
    year = AcademicYear.objects.select_for_update().get(pk=year.pk)
    if year.status != AcademicYear.Status.ACTIVE:
        raise ConflictError(ErrorCode.INVALID_STATE_TRANSITION, f"Tahun ajaran berstatus {year.status}.")
    open_terms = year.trimesters.exclude(status=Trimester.Status.CLOSED).count()
    if open_terms:
        raise ConflictError(ErrorCode.INVALID_STATE_TRANSITION, f"{open_terms} trimestre belum CLOSED.")
    year.status = AcademicYear.Status.CLOSED
    year.save(update_fields=["status", "updated_at"])
    audit.record(AuditEvent.ACADEMIC_YEAR_CLOSED, actor=actor, resource=year, after={"status": year.status})
    return year


@transaction.atomic
def make_current(*, actor, year):
    """Switch the "current" year shown by default (e.g. after promotion into the next year)."""
    year = AcademicYear.objects.select_for_update().get(pk=year.pk)
    if year.status == AcademicYear.Status.CLOSED:
        raise ConflictError(ErrorCode.INVALID_STATE_TRANSITION, "Tahun ajaran sudah ditutup.")
    AcademicYear.objects.filter(is_current=True).exclude(pk=year.pk).update(is_current=False)
    year.is_current = True
    year.save(update_fields=["is_current", "updated_at"])
    audit.record("SYSTEM_SETTING_CHANGED", actor=actor, resource=year, after={"is_current": True})
    return year


_TRIMESTER_FLOW = {
    Trimester.Status.DRAFT: Trimester.Status.ACTIVE,
    Trimester.Status.ACTIVE: Trimester.Status.GRADING,
    Trimester.Status.GRADING: Trimester.Status.CLOSED,
}


@transaction.atomic
def advance_trimester(*, actor, trimester, target):
    trimester = Trimester.objects.select_for_update(of=("self",)).select_related("academic_year").get(pk=trimester.pk)
    if _TRIMESTER_FLOW.get(trimester.status) != target:
        raise ConflictError(ErrorCode.INVALID_STATE_TRANSITION, f"Trimestre {trimester.status} tidak dapat menjadi {target}.")
    if target == Trimester.Status.ACTIVE:
        if trimester.academic_year.status != AcademicYear.Status.ACTIVE:
            raise ConflictError(ErrorCode.INVALID_STATE_TRANSITION, "Aktifkan tahun ajaran terlebih dahulu.")
        previous = trimester.academic_year.trimesters.filter(number__lt=trimester.number).exclude(status=Trimester.Status.CLOSED)
        if (
            previous.exclude(status=Trimester.Status.GRADING).exists()
            or Trimester.objects.filter(academic_year=trimester.academic_year, status=Trimester.Status.ACTIVE).exists()
        ):
            raise ConflictError(ErrorCode.INVALID_STATE_TRANSITION, "Trimestre sebelumnya masih aktif.")
    before = trimester.status
    trimester.status = target
    trimester.save(update_fields=["status", "updated_at"])
    audit.record(AuditEvent.TRIMESTER_STATUS_CHANGED, actor=actor, resource=trimester, before={"status": before}, after={"status": target})
    return trimester

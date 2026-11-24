"""Academic integrity checks (PRD §54 INT-002/003/004/007)."""

from django.db.models import Count

from .models import AcademicYear, ClassRoom, Trimester


def int_002_single_current_year():
    n = AcademicYear.objects.filter(is_current=True).count()
    return "INT-002", n <= 1, f"current years: {n}"


def int_003_active_year_three_trimesters():
    bad = [
        y.name for y in AcademicYear.objects.filter(status="ACTIVE") if sorted(y.trimesters.values_list("number", flat=True)) != [1, 2, 3]
    ]
    return "INT-003", not bad, f"active years without exactly 1,2,3: {bad}"


def int_004_cau_and_dates():
    bad = [
        str(t)
        for t in Trimester.objects.select_related("academic_year")
        if t.cau_number != t.number or t.start_date < t.academic_year.start_date or t.end_date > t.academic_year.end_date
    ]
    return "INT-004", not bad, f"invalid trimestres: {bad}"


def int_007_unique_classroom_codes():
    dup = ClassRoom.objects.values("academic_year", "code").annotate(n=Count("id")).filter(n__gt=1).count()
    return "INT-007", dup == 0, f"duplicate classroom codes: {dup}"

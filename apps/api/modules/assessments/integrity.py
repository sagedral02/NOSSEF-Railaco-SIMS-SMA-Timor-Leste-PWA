"""Assessment integrity checks (PRD §54 INT-011..INT-015)."""

from decimal import Decimal

from django.db.models import Exists, F, OuterRef, Q, Sum

from .models import Assessment, GradingScheme, StudentScore, TermGrade


def int_011_cau_matches_trimester():
    bad = (
        Assessment.objects.filter(assessment_type__code="CAU")
        .filter(~Q(cau_number=F("trimester__number")) | Q(cau_number__isnull=True))
        .count()
    )
    return "INT-011", bad == 0, f"CAU assessments with mismatched trimester: {bad}"


def int_012_active_scheme_weights():
    bad = (
        GradingScheme.objects.filter(status__in=["ACTIVE", "LOCKED"])
        .annotate(total=Sum("components__weight_percent"))
        .exclude(total=Decimal("100"))
        .count()
    )
    return "INT-012", bad == 0, f"active schemes whose weights are not 100: {bad}"


def int_013_score_within_range():
    bad = StudentScore.objects.filter(Q(score__lt=0) | Q(score__gt=F("assessment__max_score"))).count()
    return "INT-013", bad == 0, f"scores outside 0..max_score: {bad}"


def int_014_finalized_has_final_score():
    bad = TermGrade.objects.filter(status="FINALIZED", final_score__isnull=True).count()
    return "INT-014", bad == 0, f"finalized term grades without final_score: {bad}"


def int_015_published_report_complete():
    from modules.report_cards.models import ReportCard, ReportCardSubject

    rows = ReportCardSubject.objects.filter(report_card=OuterRef("pk"))
    bad = (
        ReportCard.objects.filter(status="PUBLISHED").annotate(has=Exists(rows)).filter(Q(has=False) | Q(published_at__isnull=True)).count()
    )
    return "INT-015", bad == 0, f"published reports without subject rows/publish metadata: {bad}"

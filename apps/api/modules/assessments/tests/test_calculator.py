"""Rounding/aggregation regression tests (F7-16). Values agreed as the school's worked examples."""

from decimal import Decimal as D

from modules.assessments.calculator import ComponentInput, ScoreInput, calculate


def comp(name, weight, *scores, remedial=()):
    rows = [ScoreInput(D(str(s)) if s is not None else None, "GRADED" if s is not None else "PENDING", D("10")) for s in scores]
    rows += [ScoreInput(D(str(s)), "GRADED", D("10"), is_remedial=True) for s in remedial]
    return ComponentInput(name, D(str(weight)), rows)


def test_nossef_weighting_on_ten_point_scale():
    # TPC 8 · Teste1 6 · Teste2 7 · CAU 5  →  8*.2 + 6*.25 + 7*.25 + 5*.3 = 6.35
    r = calculate([comp("TPC", 20, 8), comp("T1", 25, 6), comp("T2", 25, 7), comp("CAU", 30, 5)], scale_max=D("10"))
    assert r.complete and r.final == D("6.35")


def test_half_up_rounding_is_deterministic():
    # 2/3 → 66.666… % of 10 = 6.6666… → 6.67 (ROUND_HALF_UP at the final boundary only)
    r = calculate([comp("A", 100, D("6.6666666667"))], scale_max=D("10"))
    assert r.final == D("6.67")
    r2 = calculate([comp("A", 50, 5), comp("B", 50, D("5.01"))], scale_max=D("10"), precision=1)
    assert r2.final == D("5.0")  # 5.005 → 5.0 with precision 1 (no double rounding of components)


def test_pending_score_marks_incomplete_and_missing_component():
    r = calculate([comp("TPC", 20, 8), comp("CAU", 80, None)], scale_max=D("10"))
    assert not r.complete and r.missing == ["CAU"]


def test_weights_must_total_100_to_be_complete():
    r = calculate([comp("A", 60, 8), comp("B", 30, 8)], scale_max=D("10"))
    assert not r.complete


def test_absent_and_excused_policies():
    absent = ComponentInput("A", D("100"), [ScoreInput(None, "ABSENT", D("10")), ScoreInput(D("8"), "GRADED", D("10"))])
    assert calculate([absent], scale_max=D("10"), absent_policy="ZERO").final == D("4.00")
    assert calculate([absent], scale_max=D("10"), absent_policy="EXCLUDE").final == D("8.00")
    excused = ComponentInput("A", D("100"), [ScoreInput(None, "EXCUSED", D("10")), ScoreInput(D("6"), "GRADED", D("10"))])
    assert calculate([excused], scale_max=D("10")).final == D("6.00")


def test_total_points_vs_mean_aggregation():
    c = ComponentInput("A", D("100"), [ScoreInput(D("5"), "GRADED", D("10")), ScoreInput(D("40"), "GRADED", D("50"))])
    assert calculate([c], aggregation="MEAN").final == D("65.00")  # (50% + 80%) / 2
    assert calculate([c], aggregation="TOTAL_POINTS").final == D("75.00")  # 45 / 60


def test_remedial_policies():
    base = [comp("A", 100, 4, remedial=[7])]
    assert calculate(base, scale_max=D("10"), remedial_policy="MAX").final == D("7.00")
    assert calculate(base, scale_max=D("10"), remedial_policy="REPLACE").final == D("7.00")
    assert calculate(base, scale_max=D("10"), remedial_policy="CAP_AT_PASSING", passing_score=D("5")).final == D("5.00")

"""Authoritative term-grade calculator (PRD §22.2, §65.6). Decimal end-to-end, single quantization at the end.

    normalized = earned / max_score * 100
    component  = aggregation(normalized scores)        (MEAN or TOTAL_POINTS; remedial per policy)
    percent    = Σ component * weight / 100
    final      = quantize(percent * scale_max / 100, precision, ROUND_HALF_UP)

Results are previews until finalized; the frontend never computes authoritative grades.
"""

from dataclasses import dataclass, field
from decimal import ROUND_HALF_UP, Decimal

HUNDRED = Decimal("100")


@dataclass
class ScoreInput:
    score: Decimal | None
    status: str  # PENDING / GRADED / ABSENT / EXCUSED
    max_score: Decimal
    is_remedial: bool = False


@dataclass
class ComponentInput:
    name: str
    weight_percent: Decimal
    scores: list[ScoreInput] = field(default_factory=list)
    has_assessments: bool = True


@dataclass
class Result:
    final: Decimal | None
    percent: Decimal | None
    complete: bool
    components: list[dict]
    missing: list[str]


def _aggregate(scores, aggregation, absent_policy):
    """Return component percent (0..100) or None when nothing countable; flag pending."""
    counted = []
    pending = False
    for s in scores:
        if s.status == "PENDING" or (s.status == "GRADED" and s.score is None):
            pending = True
            continue
        if s.status == "EXCUSED" or (s.status == "ABSENT" and absent_policy == "EXCLUDE"):
            continue
        earned = Decimal("0") if s.status == "ABSENT" else Decimal(s.score)
        counted.append((earned, Decimal(s.max_score)))
    if not counted:
        return None, pending
    if aggregation == "TOTAL_POINTS":
        return sum(e for e, _ in counted) / sum(m for _, m in counted) * HUNDRED, pending
    return sum(e / m * HUNDRED for e, m in counted) / len(counted), pending


def _apply_remedial(original, remedial, policy, passing_percent):
    if remedial is None:
        return original
    if original is None or policy == "REPLACE":
        return remedial
    best = max(original, remedial)
    if policy == "CAP_AT_PASSING" and passing_percent is not None and remedial > original:
        return max(original, min(remedial, passing_percent))
    return best


def calculate(
    components, *, scale_max=HUNDRED, precision=2, aggregation="MEAN", absent_policy="ZERO", remedial_policy="MAX", passing_score=None
):
    scale_max = Decimal(scale_max)
    passing_percent = (Decimal(passing_score) / scale_max * HUNDRED) if passing_score is not None else None
    total_weight = sum(Decimal(c.weight_percent) for c in components)
    out, missing = [], []
    percent = Decimal("0")
    complete = total_weight == HUNDRED
    for c in components:
        original, pend_o = _aggregate([s for s in c.scores if not s.is_remedial], aggregation, absent_policy)
        remedial, _ = _aggregate([s for s in c.scores if s.is_remedial], aggregation, absent_policy)
        value = _apply_remedial(original, remedial, remedial_policy, passing_percent)
        if not c.has_assessments or value is None or pend_o:
            complete = False
            missing.append(c.name)
        contribution = (value or Decimal("0")) * Decimal(c.weight_percent) / HUNDRED
        percent += contribution
        out.append(
            {
                "name": c.name,
                "weight": str(c.weight_percent),
                "percent": str(value.quantize(Decimal("0.0001"))) if value is not None else None,
                "remedial_applied": remedial is not None,
            }
        )
    quant = Decimal(1).scaleb(-precision)
    final = (percent * scale_max / HUNDRED).quantize(quant, rounding=ROUND_HALF_UP)
    return Result(
        final=final, percent=percent.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP), complete=complete, components=out, missing=missing
    )

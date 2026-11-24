"""Assessment/CAU/score/term-grade workflows (PRD §22, F7)."""

from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.db.models import F
from django.utils import timezone

from common.api.exceptions import ConflictError, DomainError, ErrorCode
from common.events import emit
from common.permissions import user_has_global, user_has_perm
from modules.academics.models import TeachingAssignment, Trimester
from modules.academics.selectors import teacher_of
from modules.audit import services as audit
from modules.audit.events import AuditEvent
from modules.students.models import Student, StudentEnrollment

from . import calculator
from .models import Assessment, AssessmentType, GradingComponent, GradingScheme, ScoreRevision, StudentScore, TermGrade

HUNDRED = Decimal("100")


# ------------------------------------------------------------------ scope


def can_manage_assignment(user, assignment):
    """Teacher writes only on own assignment; curriculum/admin (global assessment.update/score.revise) on any."""
    if user_has_global(user, "assessment.update") or user_has_global(user, "score.revise"):
        return True
    teacher = teacher_of(user)
    return teacher is not None and assignment.teacher_id == teacher.pk and assignment.active


def can_view_assignment(user, assignment):
    if user_has_global(user, "assessment.view"):
        return True
    teacher = teacher_of(user)
    if teacher is None:
        return False
    return assignment.teacher_id == teacher.pk or assignment.classroom.homeroom_teacher_id == teacher.pk


def _deny(msg="Anda hanya dapat mengelola penilaian pada penugasan mengajar sendiri."):
    return DomainError(ErrorCode.PERMISSION_DENIED, msg, status_code=403)


def roster(assignment, trimester):
    """Students enrolled in the class at any point overlapping the trimester (transfers keep their history)."""
    ids = (
        StudentEnrollment.objects.filter(classroom=assignment.classroom, start_date__lte=trimester.end_date)
        .exclude(status="CANCELLED")
        .exclude(end_date__lt=trimester.start_date)
        .values("student_id")
    )
    return Student.objects.filter(pk__in=ids).order_by("full_name")


# ------------------------------------------------------------------ schemes


def active_scheme(offering, trimester):
    return (
        GradingScheme.objects.filter(subject_offering=offering, trimester=trimester, status__in=["ACTIVE", "LOCKED"])
        .prefetch_related("components__assessment_type")
        .first()
    )


@transaction.atomic
def activate_scheme(*, actor, scheme):
    scheme = GradingScheme.objects.select_for_update().get(pk=scheme.pk)
    if scheme.status != GradingScheme.Status.DRAFT:
        raise ConflictError(ErrorCode.INVALID_STATE_TRANSITION, f"Skema berstatus {scheme.status}.")
    comps = list(scheme.components.select_related("assessment_type"))
    total = sum((c.weight_percent for c in comps), Decimal("0"))
    if total != HUNDRED:
        raise DomainError(
            ErrorCode.GRADING_WEIGHT_INVALID, f"Total bobot komponen {total}%, harus tepat 100%.", details={"total": str(total)}
        )
    caus = [c for c in comps if c.is_cau_component]
    if len(caus) != 1 or caus[0].assessment_type.code != "CAU":
        raise DomainError(ErrorCode.VALIDATION_ERROR, "Skema wajib memiliki tepat satu komponen CAU (tipe CAU).")
    if GradingScheme.objects.filter(
        subject_offering=scheme.subject_offering, trimester=scheme.trimester, status__in=["ACTIVE", "LOCKED"]
    ).exists():
        raise ConflictError(ErrorCode.INVALID_STATE_TRANSITION, "Sudah ada skema aktif untuk mapel & trimestre ini.")
    scheme.status = GradingScheme.Status.ACTIVE
    scheme.save(update_fields=["status", "updated_at"])
    audit.record(
        "GRADING_SCHEME_ACTIVATED", actor=actor, resource=scheme, after={"components": [(c.name, str(c.weight_percent)) for c in comps]}
    )
    return scheme


DEFAULT_COMPONENTS = [
    ("TPC", "ASSIGNMENT", 20, False),
    ("Teste 1", "QUIZ", 25, False),
    ("Teste 2", "QUIZ", 25, False),
    ("CAU", "CAU", 30, True),
]


@transaction.atomic
def create_scheme_from_template(
    *, actor, offering, trimester, scale_max=Decimal("10"), passing_score=Decimal("5"), passing_inclusive=False, activate=True
):
    """NOSSEF default: TPC 20 · Teste 1 25 · Teste 2 25 · CAU 30, scale 0–10, pass above 5.00 (configurable, ADR-018)."""
    types = {t.code: t for t in AssessmentType.objects.all()}
    scheme = GradingScheme.objects.create(
        academic_year=trimester.academic_year,
        trimester=trimester,
        subject_offering=offering,
        name=f"{offering.subject.code} T{trimester.number}",
        scale_max=scale_max,
        passing_score=passing_score,
        passing_inclusive=passing_inclusive,
    )
    for seq, (name, code, weight, is_cau) in enumerate(DEFAULT_COMPONENTS, start=1):
        GradingComponent.objects.create(
            grading_scheme=scheme,
            assessment_type=types[code],
            name=f"CAU {trimester.number}" if is_cau else name,
            weight_percent=Decimal(weight),
            sequence=seq,
            is_cau_component=is_cau,
        )
    if activate:
        scheme = activate_scheme(actor=actor, scheme=scheme)
    return scheme


# ------------------------------------------------------------------ assessments


def _check_window(user, trimester):
    trimester = Trimester.objects.get(pk=trimester.pk)  # authoritative state, not a possibly stale instance
    if trimester.status in {Trimester.Status.CLOSED, Trimester.Status.DRAFT}:
        raise ConflictError(ErrorCode.ASSESSMENT_LOCKED, f"Trimestre berstatus {trimester.status}; input nilai ditutup.")
    now = timezone.now()
    if user_has_perm(user, "score.revise"):
        return
    if (trimester.grade_entry_start and now < trimester.grade_entry_start) or (
        trimester.grade_entry_end and now > trimester.grade_entry_end
    ):
        if trimester.status != Trimester.Status.ACTIVE:
            raise ConflictError(ErrorCode.ASSESSMENT_LOCKED, "Di luar jadwal input nilai trimestre.")


@transaction.atomic
def create_assessment(*, actor, assignment, trimester, component, title, assessment_date, max_score, is_remedial=False, status="OPEN"):
    if not can_manage_assignment(actor, assignment):
        raise _deny()
    if trimester.academic_year_id != assignment.academic_year_id:
        raise DomainError(ErrorCode.VALIDATION_ERROR, "Data tidak valid.", fields={"trimester": ["Trimestre bukan pada tahun penugasan."]})
    if not (trimester.start_date <= assessment_date <= trimester.end_date):
        raise DomainError(ErrorCode.VALIDATION_ERROR, "Data tidak valid.", fields={"assessment_date": ["Tanggal di luar trimestre."]})
    scheme = GradingScheme.objects.get(pk=component.grading_scheme_id)  # never trust a cached relation for state checks
    if scheme.trimester_id != trimester.pk or scheme.subject_offering_id != assignment.subject_offering_id or scheme.status == "DRAFT":
        raise DomainError(
            ErrorCode.VALIDATION_ERROR,
            "Data tidak valid.",
            fields={"grading_component": ["Komponen bukan dari skema aktif mapel/trimestre ini."]},
        )
    _check_window(actor, trimester)
    cau_number = trimester.number if component.is_cau_component else None
    if component.is_cau_component and component.assessment_type.code != "CAU":
        raise DomainError(ErrorCode.CAU_TRIMESTER_MISMATCH, "Komponen CAU harus bertipe CAU.")
    a = Assessment.objects.create(
        teaching_assignment=assignment,
        trimester=trimester,
        assessment_type=component.assessment_type,
        grading_component=component,
        title=title,
        assessment_date=assessment_date,
        max_score=max_score,
        cau_number=cau_number,
        is_remedial=is_remedial,
        status=status,
    )
    audit.record(
        "ASSESSMENT_CREATED", actor=actor, resource=a, after={"title": title, "cau_number": cau_number, "max_score": str(max_score)}
    )
    emit("assessment.created", assessment_id=str(a.pk))
    return a


def validate_cau(assessment):
    """INV-03 guard used by integrity checks and tests."""
    if assessment.assessment_type.code == "CAU" and assessment.cau_number != assessment.trimester.number:
        raise DomainError(
            ErrorCode.CAU_TRIMESTER_MISMATCH, f"CAU {assessment.cau_number} tidak boleh pada Trimestre {assessment.trimester.number}."
        )


_FLOW = {"OPEN": {"DRAFT", "CLOSED"}, "CLOSED": {"OPEN"}, "LOCKED": {"CLOSED", "OPEN"}}


@transaction.atomic
def set_assessment_status(*, actor, assessment, target, reason=""):
    a = Assessment.objects.select_for_update(of=("self",)).select_related("teaching_assignment").get(pk=assessment.pk)
    if a.status == Assessment.Status.LOCKED and not user_has_perm(actor, "grade.reopen"):
        raise ConflictError(ErrorCode.ASSESSMENT_LOCKED, "Penilaian terkunci; buka kembali oleh kurikulum dengan alasan.")
    if target == "LOCKED" and not (user_has_perm(actor, "grade.finalize") and can_manage_assignment(actor, a.teaching_assignment)):
        raise _deny()
    if target != "LOCKED" and not can_manage_assignment(actor, a.teaching_assignment) and not user_has_perm(actor, "grade.reopen"):
        raise _deny()
    if a.status not in _FLOW.get(target, set()) and not (a.status == "LOCKED" and target in {"OPEN", "CLOSED"}):
        raise ConflictError(ErrorCode.INVALID_STATE_TRANSITION, f"Penilaian {a.status} tidak dapat menjadi {target}.")
    if a.status == "LOCKED" and not reason.strip():
        raise DomainError(ErrorCode.TERM_GRADE_REOPEN_REASON_REQUIRED, "Alasan wajib untuk membuka penilaian terkunci.")
    before = a.status
    a.status = target
    a.version += 1
    a.save(update_fields=["status", "version", "updated_at"])
    audit.record(
        "ASSESSMENT_STATUS_CHANGED",
        actor=actor,
        resource=a,
        before={"status": before},
        after={"status": target},
        metadata={"reason": reason[:500]},
    )
    return a


# ------------------------------------------------------------------ scores


def _parse_score(value, max_score):
    if value is None or value == "":
        return None
    try:
        d = Decimal(str(value)).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError):
        raise DomainError(ErrorCode.ASSESSMENT_SCORE_OUT_OF_RANGE, f"Nilai tidak valid: {value}.")
    if d < 0 or d > max_score:
        raise DomainError(
            ErrorCode.ASSESSMENT_SCORE_OUT_OF_RANGE, f"Nilai {d} di luar rentang 0–{max_score}.", details={"max_score": str(max_score)}
        )
    return d


@transaction.atomic
def save_scores(*, actor, assessment, items):
    """Bulk upsert scores (all-or-nothing). Items: {student_id, score, status?, expected_version?, reason?}.

    Changes to an already GRADED score after the assessment is CLOSED (or by a non-owner) create ScoreRevision with a reason.
    Students whose term grade is FINALIZED cannot be changed (reopen first)."""
    a = (
        Assessment.objects.select_for_update(of=("self",))
        .select_related("teaching_assignment__classroom", "trimester")
        .get(pk=assessment.pk)
    )
    if not can_manage_assignment(actor, a.teaching_assignment):
        raise _deny()
    if a.status == Assessment.Status.LOCKED:
        raise ConflictError(ErrorCode.ASSESSMENT_LOCKED, "Penilaian terkunci.")
    if a.status == Assessment.Status.DRAFT:
        raise ConflictError(ErrorCode.INVALID_STATE_TRANSITION, "Buka penilaian (OPEN) sebelum input nilai.")
    _check_window(actor, a.trimester)
    roster_ids = {str(pk) for pk in roster(a.teaching_assignment, a.trimester).values_list("pk", flat=True)}
    finalized = {
        str(sid)
        for sid in TermGrade.objects.filter(
            trimester=a.trimester, teaching_assignment=a.teaching_assignment, status="FINALIZED"
        ).values_list("student_id", flat=True)
    }
    errors, changed = {}, 0
    for item in items:
        sid = str(item["student_id"])
        try:
            if sid not in roster_ids:
                raise DomainError(ErrorCode.ATTENDANCE_STUDENT_NOT_ENROLLED, "Siswa tidak terdaftar di rombel ini.")
            if sid in finalized:
                raise DomainError(ErrorCode.TERM_GRADE_FINALIZED, "Nilai akhir siswa ini sudah final; buka kembali untuk mengubah.")
            status = item.get("status") or ("GRADED" if item.get("score") not in (None, "") else "PENDING")
            score = _parse_score(item.get("score"), a.max_score) if status == "GRADED" else None
            if status == "GRADED" and score is None:
                raise DomainError(ErrorCode.ASSESSMENT_SCORE_OUT_OF_RANGE, "Nilai wajib diisi untuk status GRADED.")
            row = StudentScore.objects.select_for_update().filter(assessment=a, student_id=sid).first()
            if row is None:
                if status == "PENDING":
                    continue
                StudentScore.objects.create(
                    assessment=a, student_id=sid, score=score, status=status, recorded_by=actor, is_remedial=a.is_remedial
                )
                changed += 1
                continue
            if item.get("expected_version") is not None and item["expected_version"] != row.version:
                raise ConflictError(
                    ErrorCode.ATTENDANCE_VERSION_CONFLICT,
                    "Nilai telah berubah di server.",
                    details={"server": {"score": str(row.score) if row.score is not None else None, "version": row.version}},
                )
            if row.score == score and row.status == status:
                continue
            needs_revision = row.status == "GRADED" and (a.status == Assessment.Status.CLOSED or item.get("reason"))
            if needs_revision:
                reason = (item.get("reason") or "").strip()
                if not reason:
                    raise DomainError(ErrorCode.VALIDATION_ERROR, "Alasan revisi nilai wajib diisi.", fields={"reason": ["Wajib."]})
                ScoreRevision.objects.create(
                    student_score=row,
                    old_score=row.score,
                    new_score=score,
                    old_status=row.status,
                    new_status=status,
                    reason=reason,
                    changed_by=actor,
                )
                audit.record(
                    AuditEvent.SCORE_REVISED,
                    actor=actor,
                    resource=row,
                    before={"score": str(row.score), "status": row.status},
                    after={"score": str(score) if score is not None else None, "status": status},
                    metadata={"reason": reason[:500]},
                )
                emit("score.revised", score_id=str(row.pk))
            StudentScore.objects.filter(pk=row.pk).update(
                score=score, status=status, recorded_by=actor, version=F("version") + 1, updated_at=timezone.now()
            )
            changed += 1
        except DomainError as exc:
            errors[sid] = {"code": exc.error_code, "message": exc.message, **exc.details}
    if errors:
        raise ConflictError(ErrorCode.VALIDATION_ERROR, "Sebagian nilai tidak dapat disimpan.", details={"rows": errors})
    if changed:
        audit.record(AuditEvent.SCORE_RECORDED, actor=actor, resource=a, metadata={"changed": changed})
        Assessment.objects.filter(pk=a.pk).update(version=F("version") + 1)
    return changed


# ------------------------------------------------------------------ term grades


def compute(assignment, trimester, students=None):
    """Return {student_id: calculator.Result} for the assignment/trimester using the active scheme."""
    scheme = active_scheme(assignment.subject_offering, trimester)
    if scheme is None:
        raise DomainError(ErrorCode.GRADING_WEIGHT_INVALID, "Belum ada skema penilaian aktif untuk mapel & trimestre ini.")
    comps = list(scheme.components.all())
    assessments = list(Assessment.objects.filter(teaching_assignment=assignment, trimester=trimester).exclude(status="DRAFT"))
    students = list(students if students is not None else roster(assignment, trimester))
    scores = {}
    for s in StudentScore.objects.filter(assessment__in=assessments):
        scores[(s.assessment_id, s.student_id)] = s
    out = {}
    for st in students:
        inputs = []
        for c in comps:
            comp_assessments = [a for a in assessments if a.grading_component_id == c.pk]
            entries = []
            for a in comp_assessments:
                sc = scores.get((a.pk, st.pk))
                if sc is None:
                    if a.is_remedial:
                        continue  # remedial is optional per student
                    entries.append(calculator.ScoreInput(None, "PENDING", a.max_score))
                else:
                    entries.append(calculator.ScoreInput(sc.score, sc.status, a.max_score, is_remedial=a.is_remedial or sc.is_remedial))
            inputs.append(
                calculator.ComponentInput(
                    c.name, c.weight_percent, entries, has_assessments=any(not a.is_remedial for a in comp_assessments)
                )
            )
        out[st.pk] = calculator.calculate(
            inputs,
            scale_max=scheme.scale_max,
            precision=scheme.precision,
            aggregation=scheme.aggregation,
            absent_policy=scheme.absent_policy,
            remedial_policy=scheme.remedial_policy,
            passing_score=scheme.passing_score,
        )
    return scheme, out


def label_for(scheme, score):
    passed = scheme.passes(score)
    return "" if passed is None else ("APROVADO" if passed else "REPROVADO")


@transaction.atomic
def recalculate(*, actor, assignment, trimester):
    """Persist DRAFT/REOPENED term grades with calculated_score (preview); finalized rows never change silently."""
    if not can_view_assignment(actor, assignment):
        raise _deny()
    scheme, results = compute(assignment, trimester)
    for sid, r in results.items():
        tg, _ = TermGrade.objects.select_for_update().get_or_create(student_id=sid, trimester=trimester, teaching_assignment=assignment)
        if tg.status == TermGrade.Status.FINALIZED:
            continue
        tg.calculated_score = r.final if r.complete else None
        tg.breakdown = {"components": r.components, "missing": r.missing, "percent": str(r.percent), "complete": r.complete}
        tg.grade_label = label_for(scheme, r.final) if r.complete else ""
        tg.version += 1
        tg.save(update_fields=["calculated_score", "breakdown", "grade_label", "version", "updated_at"])
    return scheme, results


@transaction.atomic
def finalize(*, actor, assignment, trimester, student_ids=None):
    if not (user_has_perm(actor, "grade.finalize") and can_manage_assignment(actor, assignment)):
        raise _deny("Finalisasi membutuhkan izin grade.finalize pada penugasan ini.")
    if Trimester.objects.filter(pk=trimester.pk, status=Trimester.Status.CLOSED).exists():
        raise ConflictError(ErrorCode.INVALID_STATE_TRANSITION, "Trimestre sudah ditutup.")
    scheme, results = recalculate(actor=actor, assignment=assignment, trimester=trimester)
    targets = [sid for sid in results if student_ids is None or str(sid) in {str(x) for x in student_ids}]
    incomplete = [str(sid) for sid in targets if not results[sid].complete]
    if incomplete:
        raise DomainError(
            ErrorCode.REPORT_NOT_READY,
            f"{len(incomplete)} siswa belum memiliki nilai lengkap.",
            details={"incomplete_student_ids": incomplete},
            status_code=409,
        )
    now = timezone.now()
    n = 0
    for tg in (
        TermGrade.objects.select_for_update()
        .filter(teaching_assignment=assignment, trimester=trimester, student_id__in=targets)
        .exclude(status=TermGrade.Status.FINALIZED)
    ):
        r = results[tg.student_id]
        tg.final_score = r.final
        tg.calculated_score = r.final
        tg.grade_label = label_for(scheme, r.final)
        tg.status = TermGrade.Status.FINALIZED
        tg.finalized_by, tg.finalized_at = actor, now
        tg.version += 1
        tg.save()
        n += 1
        audit.record(
            AuditEvent.TERM_GRADE_FINALIZED, actor=actor, resource=tg, after={"final_score": str(tg.final_score), "label": tg.grade_label}
        )
    if n:
        emit("term_grade.finalized", teaching_assignment_id=str(assignment.pk), trimester_id=str(trimester.pk))
    return n


@transaction.atomic
def reopen(*, actor, term_grade, reason):
    if not user_has_perm(actor, "grade.reopen"):
        raise _deny("Membuka kembali nilai membutuhkan izin grade.reopen.")
    if not reason.strip():
        raise DomainError(ErrorCode.TERM_GRADE_REOPEN_REASON_REQUIRED, "Alasan wajib diisi untuk membuka kembali nilai.")
    tg = TermGrade.objects.select_for_update().get(pk=term_grade.pk)
    if tg.status != TermGrade.Status.FINALIZED:
        raise ConflictError(ErrorCode.INVALID_STATE_TRANSITION, f"Nilai berstatus {tg.status}.")
    from modules.report_cards.guards import assert_no_published_report  # late import: optional module dependency

    assert_no_published_report(tg)
    before = {"final_score": str(tg.final_score), "status": tg.status}
    tg.status = TermGrade.Status.REOPENED
    tg.version += 1
    tg.save(update_fields=["status", "version", "updated_at"])
    audit.record(
        AuditEvent.TERM_GRADE_REOPENED,
        actor=actor,
        resource=tg,
        before=before,
        after={"status": tg.status},
        metadata={"reason": reason[:500]},
    )
    emit("term_grade.reopened", term_grade_id=str(tg.pk))
    return tg


@transaction.atomic
def override_final(*, actor, term_grade, final_score, reason):
    """Final grade override (PRD §22.2): dedicated permission (grade.reopen), reason and audit."""
    if not user_has_perm(actor, "grade.reopen"):
        raise _deny("Override nilai akhir membutuhkan izin grade.reopen.")
    if not reason.strip():
        raise DomainError(ErrorCode.TERM_GRADE_REOPEN_REASON_REQUIRED, "Alasan wajib diisi.")
    tg = (
        TermGrade.objects.select_for_update(of=("self",))
        .select_related("teaching_assignment__subject_offering", "trimester")
        .get(pk=term_grade.pk)
    )
    if tg.status == TermGrade.Status.FINALIZED:
        raise ConflictError(ErrorCode.TERM_GRADE_FINALIZED, "Buka kembali nilai sebelum override.")
    scheme = active_scheme(tg.teaching_assignment.subject_offering, tg.trimester)
    value = Decimal(str(final_score))
    if value < 0 or value > scheme.scale_max:
        raise DomainError(ErrorCode.ASSESSMENT_SCORE_OUT_OF_RANGE, f"Nilai di luar 0–{scheme.scale_max}.")
    before = {"final_score": str(tg.final_score), "calculated": str(tg.calculated_score)}
    tg.final_score = value.quantize(Decimal(1).scaleb(-scheme.precision))
    tg.grade_label = label_for(scheme, tg.final_score)
    tg.override_reason = reason
    tg.status = TermGrade.Status.FINALIZED
    tg.finalized_by, tg.finalized_at = actor, timezone.now()
    tg.version += 1
    tg.save()
    audit.record(
        AuditEvent.TERM_GRADE_FINALIZED,
        actor=actor,
        resource=tg,
        before=before,
        after={"final_score": str(tg.final_score)},
        metadata={"override": True, "reason": reason[:500]},
    )
    return tg


def completion(trimester, classroom_ids=None):
    """Completion monitor (PRD §64 /grades/completion): finalized vs expected term grades per assignment."""
    qs = TeachingAssignment.objects.filter(academic_year=trimester.academic_year, active=True).select_related(
        "classroom", "teacher", "subject_offering__subject"
    )
    if classroom_ids is not None:
        qs = qs.filter(classroom_id__in=classroom_ids)
    rows = []
    for ta in qs:
        expected = roster(ta, trimester).count()
        finalized = TermGrade.objects.filter(teaching_assignment=ta, trimester=trimester, status="FINALIZED").count()
        rows.append(
            {
                "teaching_assignment_id": str(ta.pk),
                "classroom": ta.classroom.name,
                "classroom_id": str(ta.classroom_id),
                "subject_code": ta.subject_offering.subject.code,
                "subject_name": ta.subject_offering.subject.name,
                "teacher": ta.teacher.full_name,
                "expected": expected,
                "finalized": finalized,
                "has_scheme": active_scheme(ta.subject_offering, trimester) is not None,
                "assessments": Assessment.objects.filter(teaching_assignment=ta, trimester=trimester).count(),
            }
        )
    return rows

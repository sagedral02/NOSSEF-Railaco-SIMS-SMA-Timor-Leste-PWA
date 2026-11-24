"""Report card workflow, transcript and promotion (PRD §23, §17.3, F8)."""

from decimal import Decimal

from django.db import IntegrityError, transaction
from django.utils import timezone

from common.api.exceptions import ConflictError, DomainError, ErrorCode
from common.events import emit
from common.permissions import user_has_global, user_has_perm
from modules.academics.models import GradeLevel, TeachingAssignment, Trimester
from modules.academics.selectors import homeroom_classroom_ids
from modules.assessments.models import Assessment, StudentScore, TermGrade
from modules.attendance import services as attendance
from modules.audit import services as audit
from modules.audit.events import AuditEvent
from modules.school.services import get_profile
from modules.students import services as students
from modules.students.models import EnrollmentSource, EnrollmentStatus, StudentEnrollment

from .models import PromotionDecision, ReportCard, ReportCardSubject

R = ReportCard.Status


def _deny(msg):
    return DomainError(ErrorCode.PERMISSION_DENIED, msg, status_code=403)


def can_manage_class(user, classroom):
    return user_has_global(user, "report.generate") or (
        user_has_perm(user, "report.generate") and classroom.pk in homeroom_classroom_ids(user)
    )


def class_enrollments(classroom, trimester):
    return (
        StudentEnrollment.objects.filter(classroom=classroom, start_date__lte=trimester.end_date)
        .exclude(status="CANCELLED")
        .exclude(end_date__lt=trimester.end_date)
        .select_related("student", "grade_level", "major", "academic_year", "classroom")
    )


def readiness(classroom, trimester):
    """Which term grades are missing/not finalized per student (PRD §23.3: incomplete grades block publish)."""
    assignments = list(TeachingAssignment.objects.filter(classroom=classroom, active=True).select_related("subject_offering__subject"))
    finalized = set(
        TermGrade.objects.filter(trimester=trimester, teaching_assignment__in=assignments, status="FINALIZED").values_list(
            "student_id", "teaching_assignment_id"
        )
    )
    out = {}
    for enr in class_enrollments(classroom, trimester):
        missing = [ta.subject_offering.subject.code for ta in assignments if (enr.student_id, ta.pk) not in finalized]
        out[enr.student_id] = missing
    return out


def _cau_score(term_grade):
    """CAU component result (on the scheme scale) for the report's CAU column."""
    cau = Assessment.objects.filter(
        teaching_assignment=term_grade.teaching_assignment,
        trimester=term_grade.trimester,
        grading_component__is_cau_component=True,
        is_remedial=False,
    ).first()
    if cau is None:
        return None
    sc = StudentScore.objects.filter(assessment=cau, student=term_grade.student_id, status="GRADED").first()
    if sc is None:
        return None
    scale = cau.grading_component.grading_scheme.scale_max
    return (Decimal(sc.score) / cau.max_score * scale).quantize(Decimal("0.01"))


def _build(report, enrollment, trimester):
    tgs = list(
        TermGrade.objects.filter(
            student=enrollment.student, trimester=trimester, status="FINALIZED", teaching_assignment__classroom=enrollment.classroom
        ).select_related("teaching_assignment__subject_offering__subject")
    )
    report.subjects.all().delete()
    rows = []
    for i, tg in enumerate(sorted(tgs, key=lambda g: g.teaching_assignment.subject_offering.subject.code)):
        subj = tg.teaching_assignment.subject_offering.subject
        cau = _cau_score(tg)
        ReportCardSubject.objects.create(
            report_card=report,
            subject=subj,
            term_grade=tg,
            final_score=tg.final_score,
            grade_label=tg.grade_label,
            cau_score=cau,
            sequence=i,
        )
        rows.append(
            {
                "subject_code": subj.code,
                "subject_name": subj.name,
                "final_score": str(tg.final_score),
                "grade_label": tg.grade_label,
                "cau_score": str(cau) if cau is not None else None,
            }
        )
    avg = (sum(Decimal(r["final_score"]) for r in rows) / len(rows)).quantize(Decimal("0.01")) if rows else None
    summary = attendance.student_summary(enrollment.student, trimester=trimester)
    report.attendance_summary = {
        "counts": summary["daily"] if summary["basis"] == "DAILY" else summary["lesson"],
        "rate": summary["attendance_rate"],
        "basis": summary["basis"],
    }
    report.snapshot = {
        "school_name": get_profile().name,
        "student_name": enrollment.student.full_name,
        "student_no": enrollment.student.student_no,
        "academic_year": enrollment.academic_year.name,
        "trimester": trimester.number,
        "cau": trimester.cau_number,
        "classroom": enrollment.classroom.name,
        "grade": enrollment.grade_level.code,
        "major": enrollment.major.code,
        "subjects": rows,
        "average": str(avg) if avg is not None else None,
    }


@transaction.atomic
def generate(*, actor, classroom, trimester):
    """Create/refresh DRAFT report snapshots for every student in the class (published ones untouched)."""
    if not can_manage_class(actor, classroom):
        raise _deny("Hanya wali kelas rombel ini atau kurikulum yang dapat membuat rapor.")
    if trimester.academic_year_id != classroom.academic_year_id:
        raise DomainError(ErrorCode.VALIDATION_ERROR, "Data tidak valid.", fields={"trimester": ["Beda tahun ajaran."]})
    created = updated = skipped = 0
    for enr in class_enrollments(classroom, trimester):
        working = (
            ReportCard.objects.select_for_update()
            .filter(student=enr.student, trimester=trimester, status__in=[R.DRAFT, R.REVIEWED])
            .first()
        )
        if working is None:
            if ReportCard.objects.filter(student=enr.student, trimester=trimester, status=R.PUBLISHED).exists():
                skipped += 1
                continue
            last = ReportCard.objects.filter(student=enr.student, trimester=trimester).order_by("-revision_no").first()
            working = ReportCard(
                student=enr.student,
                enrollment=enr,
                trimester=trimester,
                revision_no=(last.revision_no + 1) if last else 1,
                homeroom_note=last.homeroom_note if last else "",
            )
            working.save()
            created += 1
        else:
            working.status = R.DRAFT
            updated += 1
        working.enrollment = enr
        _build(working, enr, trimester)
        working.save()
    audit.record(
        AuditEvent.REPORT_CARD_GENERATED,
        actor=actor,
        resource=classroom,
        metadata={"trimester": trimester.number, "created": created, "updated": updated, "skipped": skipped},
    )
    return {"created": created, "updated": updated, "skipped_published": skipped}


@transaction.atomic
def review(*, actor, report, homeroom_note):
    report = ReportCard.objects.select_for_update(of=("self",)).select_related("enrollment__classroom").get(pk=report.pk)
    if not can_manage_class(actor, report.enrollment.classroom):
        raise _deny("Hanya wali kelas yang dapat meninjau rapor rombel ini.")
    if report.status not in {R.DRAFT, R.REVIEWED}:
        raise ConflictError(ErrorCode.REPORT_ALREADY_PUBLISHED, "Rapor sudah terbit; buka kembali untuk revisi.")
    report.homeroom_note = homeroom_note
    report.status = R.REVIEWED
    report.reviewed_by = actor
    report.save(update_fields=["homeroom_note", "status", "reviewed_by", "updated_at"])
    return report


@transaction.atomic
def publish(*, actor, reports):
    if not user_has_perm(actor, "report.publish"):
        raise _deny("Penerbitan rapor membutuhkan izin report.publish.")
    from .tasks import render_report_pdf

    done, blocked = [], {}
    now = timezone.now()
    for r in reports:
        r = ReportCard.objects.select_for_update(of=("self",)).select_related("enrollment__classroom", "trimester").get(pk=r.pk)
        if r.status == R.PUBLISHED:
            continue
        missing = readiness(r.enrollment.classroom, r.trimester).get(r.student_id, ["?"])
        if missing:
            blocked[str(r.pk)] = missing
            continue
        _build(r, r.enrollment, r.trimester)  # final re-snapshot at publication time
        r.snapshot["published_at"] = now.strftime("%Y-%m-%d %H:%M UTC")
        r.status, r.published_at, r.published_by = R.PUBLISHED, now, actor
        r.save()
        audit.record(
            AuditEvent.REPORT_CARD_PUBLISHED, actor=actor, resource=r, after={"revision": r.revision_no, "trimester": r.trimester.number}
        )
        rid = str(r.pk)
        transaction.on_commit(lambda rid=rid: render_report_pdf.delay(rid))
        emit("report_card.published", report_card_id=rid, student_id=str(r.student_id))
        done.append(rid)
    if blocked and not done:
        raise DomainError(
            ErrorCode.REPORT_NOT_READY,
            f"{len(blocked)} rapor belum siap: nilai belum FINALIZED.",
            details={"blocked": blocked},
            status_code=409,
        )
    return {"published": len(done), "blocked": blocked}


@transaction.atomic
def reopen(*, actor, report, reason):
    if not user_has_perm(actor, "report.reopen"):
        raise _deny("Membuka kembali rapor membutuhkan izin report.reopen.")
    if not reason.strip():
        raise DomainError(ErrorCode.TERM_GRADE_REOPEN_REASON_REQUIRED, "Alasan wajib diisi.")
    old = ReportCard.objects.select_for_update().get(pk=report.pk)
    if old.status != R.PUBLISHED:
        raise ConflictError(ErrorCode.INVALID_STATE_TRANSITION, f"Rapor berstatus {old.status}.")
    old.status = R.REOPENED
    old.reopen_reason = reason
    old.save(update_fields=["status", "reopen_reason", "updated_at"])  # file + snapshot of the old revision stay intact
    new = ReportCard.objects.create(
        student=old.student,
        enrollment=old.enrollment,
        trimester=old.trimester,
        revision_no=old.revision_no + 1,
        homeroom_note=old.homeroom_note,
        attendance_summary=old.attendance_summary,
        snapshot=old.snapshot,
    )
    _build(new, old.enrollment, old.trimester)
    new.save()
    audit.record(
        AuditEvent.REPORT_CARD_REOPENED,
        actor=actor,
        resource=old,
        after={"new_revision": new.revision_no},
        metadata={"reason": reason[:500]},
    )
    emit("report_card.reopened", report_card_id=str(old.pk))
    return new


def transcript(student):
    """Aggregates PUBLISHED report snapshots only (PRD §23.2: never draft scores)."""
    years = {}
    for r in (
        ReportCard.objects.filter(student=student, status=R.PUBLISHED)
        .select_related("trimester__academic_year")
        .order_by("trimester__academic_year__start_date", "trimester__number")
    ):
        y = years.setdefault(
            r.trimester.academic_year.name,
            {
                "academic_year": r.trimester.academic_year.name,
                "classroom": r.snapshot.get("classroom"),
                "grade": r.snapshot.get("grade"),
                "major": r.snapshot.get("major"),
                "subjects": {},
            },
        )
        for s in r.snapshot.get("subjects", []):
            row = y["subjects"].setdefault(
                s["subject_code"], {"subject_code": s["subject_code"], "subject_name": s["subject_name"], "trimesters": {}}
            )
            row["trimesters"][str(r.trimester.number)] = s["final_score"]
    out = []
    for y in years.values():
        subjects = []
        for s in y["subjects"].values():
            vals = [Decimal(v) for v in s["trimesters"].values()]
            s["annual"] = str((sum(vals) / len(vals)).quantize(Decimal("0.01"))) if vals else None
            subjects.append(s)
        y["subjects"] = subjects
        out.append(y)
    return out


# ------------------------------------------------------------------ promotion (PRD §17.3)

NEXT_GRADE = {"X": "XI", "XI": "XII"}


def promotion_preview(year, classroom=None):
    enrollments = StudentEnrollment.objects.filter(academic_year=year, status=EnrollmentStatus.ACTIVE).select_related(
        "student", "grade_level", "major", "classroom"
    )
    if classroom is not None:
        enrollments = enrollments.filter(classroom=classroom)
    t3 = Trimester.objects.filter(academic_year=year, number=3).first()
    decided = {d.student_id: d for d in PromotionDecision.objects.filter(academic_year=year)}
    rows = []
    for enr in enrollments.order_by("classroom__code", "student__full_name"):
        grades = TermGrade.objects.filter(
            student=enr.student, trimester__academic_year=year, status="FINALIZED", teaching_assignment__classroom=enr.classroom
        )
        failing = grades.filter(trimester=t3, grade_label="REPROVADO").count() if t3 else 0
        missing = readiness(enr.classroom, t3).get(enr.student_id, []) if t3 else ["T3"]
        suggestion = "GRADUATED" if enr.grade_level.code == "XII" else ("REPEATED" if failing > 3 else "PROMOTED")
        d = decided.get(enr.student_id)
        rows.append(
            {
                "student_id": str(enr.student_id),
                "student_no": enr.student.student_no,
                "full_name": enr.student.full_name,
                "classroom": enr.classroom.name,
                "classroom_id": str(enr.classroom_id),
                "grade": enr.grade_level.code,
                "major": enr.major.code,
                "failing_subjects_t3": failing,
                "missing_final_grades": missing,
                "suggestion": suggestion,
                "decision": d.decision if d else None,
            }
        )
    return {"trimester_3_status": t3.status if t3 else None, "students": rows}


@transaction.atomic
def execute_promotion(*, actor, year, student, decision, target_classroom=None, target_major=None, reason="", override_incomplete=False):
    """Idempotent per student+year (PRD §17.3, F8-10): replays return the existing decision; history is never rewritten."""
    if not user_has_perm(actor, "report.publish"):
        raise _deny("Kenaikan kelas membutuhkan izin kurikulum/kepala sekolah (report.publish).")
    existing = PromotionDecision.objects.filter(student=student, academic_year=year).first()
    if existing:
        return existing, False
    enr = (
        StudentEnrollment.objects.select_for_update(of=("self",))
        .filter(student=student, academic_year=year, status=EnrollmentStatus.ACTIVE)
        .select_related("grade_level", "major", "classroom")
        .first()
    )
    if enr is None:
        raise DomainError(ErrorCode.PROMOTION_INVALID_STATE, "Siswa tidak memiliki enrollment aktif di tahun ajaran ini.")
    t3 = Trimester.objects.filter(academic_year=year, number=3).first()
    missing = readiness(enr.classroom, t3).get(student.pk, []) if t3 else ["T3"]
    if (missing or (t3 and t3.status not in {"GRADING", "CLOSED"})) and not override_incomplete:
        raise DomainError(
            ErrorCode.PROMOTION_INVALID_STATE, "Nilai Trimestre 3 belum lengkap/final.", details={"missing": missing}, status_code=409
        )
    if override_incomplete and not (user_has_perm(actor, "grade.reopen") and reason.strip()):
        raise _deny("Override data belum lengkap membutuhkan izin grade.reopen dan alasan.")
    if decision == "GRADUATED" and enr.grade_level.code != "XII":
        raise DomainError(ErrorCode.PROMOTION_INVALID_STATE, "Kelulusan hanya untuk kelas XII.")
    if decision == "PROMOTED" and enr.grade_level.code == "XII":
        raise DomainError(ErrorCode.PROMOTION_INVALID_STATE, "Kelas XII tidak naik kelas; gunakan GRADUATED.")
    to_enr = None
    target_grade = None
    if decision in {"PROMOTED", "REPEATED"}:
        target_grade = GradeLevel.objects.get(code=NEXT_GRADE[enr.grade_level.code]) if decision == "PROMOTED" else enr.grade_level
        if decision == "REPEATED" and not reason.strip():
            raise DomainError(ErrorCode.VALIDATION_ERROR, "Alasan wajib untuk tinggal kelas.", fields={"reason": ["Wajib."]})
        if target_classroom is None:
            raise DomainError(ErrorCode.VALIDATION_ERROR, "Pilih rombel tahun berikutnya.", fields={"target_classroom": ["Wajib."]})
        if target_classroom.academic_year.start_date <= year.start_date:
            raise DomainError(ErrorCode.ENROLLMENT_CLASS_MISMATCH, "Rombel tujuan harus pada tahun ajaran berikutnya.")
        if target_classroom.grade_level_id != target_grade.pk:
            raise DomainError(ErrorCode.ENROLLMENT_CLASS_MISMATCH, f"Rombel tujuan harus tingkat {target_grade.code}.")
        major = target_major or enr.major
        if target_classroom.major_id != major.pk:
            raise DomainError(ErrorCode.ENROLLMENT_CLASS_MISMATCH, "Jurusan rombel tujuan tidak sesuai.")
        if major.pk != enr.major_id and not reason.strip():
            raise DomainError(ErrorCode.MAJOR_CHANGE_REASON_REQUIRED, "Perpindahan IPA/IPS wajib disertai alasan.")
    enr.status = {
        "PROMOTED": EnrollmentStatus.PROMOTED,
        "REPEATED": EnrollmentStatus.REPEATED,
        "GRADUATED": EnrollmentStatus.COMPLETED,
        "TRANSFERRED": EnrollmentStatus.TRANSFERRED,
    }[decision]
    enr.end_date = max(enr.start_date, year.end_date)
    enr.save(update_fields=["status", "end_date", "updated_at"])
    if decision in {"PROMOTED", "REPEATED"}:
        try:
            with transaction.atomic():
                to_enr = StudentEnrollment.objects.create(
                    student=student,
                    academic_year=target_classroom.academic_year,
                    grade_level=target_classroom.grade_level,
                    major=target_classroom.major,
                    classroom=target_classroom,
                    start_date=target_classroom.academic_year.start_date,
                    source=EnrollmentSource.PROMOTION,
                )
        except IntegrityError:
            raise ConflictError(ErrorCode.ENROLLMENT_DUPLICATE_ACTIVE, "Siswa sudah memiliki enrollment di tahun berikutnya.")
    elif decision == "GRADUATED":
        students.change_status(actor=actor, student=student, to_status="GRADUATED", effective_date=year.end_date, reason="Lulus kelas XII")
    d = PromotionDecision.objects.create(
        student=student,
        academic_year=year,
        decision=decision,
        from_enrollment=enr,
        to_enrollment=to_enr,
        target_grade_level=target_grade,
        target_major=target_classroom.major if target_classroom else None,
        target_classroom=target_classroom,
        reason=reason,
        override_incomplete=override_incomplete,
        approved_by=actor,
    )
    audit.record(
        AuditEvent.PROMOTION_EXECUTED,
        actor=actor,
        resource=student,
        after={"decision": decision, "year": year.name, "target": target_classroom.name if target_classroom else None},
        metadata={"reason": reason[:500], "override": override_incomplete},
    )
    emit("student.promoted" if decision != "GRADUATED" else "student.graduated", student_id=str(student.pk))
    return d, True

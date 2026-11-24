"""PRD §22.5 + F7 exit criteria, and §23.3 report/promotion tests."""

from datetime import date, time
from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from common.api.exceptions import DomainError
from modules.academics.models import BellPeriod, GradeLevel
from modules.academics.services import activate_year, advance_trimester
from modules.academics.tests.factories import make_assignment, make_class, make_offering, make_teacher, make_year
from modules.assessments import services
from modules.assessments.models import Assessment, GradingComponent, GradingScheme, StudentScore, TermGrade
from modules.assessments.seeding import seed_assessment_types
from modules.audit.models import AuditLog
from modules.report_cards import services as reports
from modules.report_cards.models import ReportCard
from modules.students import services as students

pytestmark = pytest.mark.django_db


@pytest.fixture
def ctx(make_user):
    seed_assessment_types()
    kur = make_user("kur", roles=["CURRICULUM_ADMIN"])
    tu = make_user("guru", roles=["TEACHER", "HOMEROOM_TEACHER"])
    other = make_user("lain", roles=["TEACHER"])
    year = make_year()
    BellPeriod.objects.create(name="Jam 1", sequence=1, start_time=time(7, 30), end_time=time(8, 15))
    teacher = make_teacher("Guru", user=tu)
    cls = make_class(year, "X-IPA-1", homeroom=teacher)
    off = make_offering(year, "MAT")
    ta = make_assignment(teacher, cls, off)
    activate_year(actor=kur, year=year)
    t1, t2, t3 = year.trimesters.order_by("number")
    advance_trimester(actor=kur, trimester=t1, target="ACTIVE")
    kids = [
        students.create_student(
            actor=kur,
            data={"full_name": f"Siswa {i}", "birth_date": date(2014, 1, 1 + i), "admission_date": year.start_date},
            classroom=cls,
        )
        for i in range(3)
    ]
    scheme = services.create_scheme_from_template(actor=kur, offering=off, trimester=t1)
    return {
        "kur": kur,
        "tu": tu,
        "other": other,
        "year": year,
        "cls": cls,
        "off": off,
        "ta": ta,
        "t1": t1,
        "t2": t2,
        "t3": t3,
        "kids": kids,
        "scheme": scheme,
        "comps": {c.name: c for c in scheme.components.all()},
    }


def _assess(ctx, name, title=None, d=date(2030, 2, 1), remedial=False):
    return services.create_assessment(
        actor=ctx["tu"],
        assignment=ctx["ta"],
        trimester=ctx["t1"],
        component=ctx["comps"][name],
        title=title or name,
        assessment_date=d,
        max_score=Decimal("10"),
        is_remedial=remedial,
    )


def _full_scores(ctx, values=(8, 6, 7, 5)):
    names = ["TPC", "Teste 1", "Teste 2", "CAU 1"]
    for name, v in zip(names, values, strict=True):
        a = _assess(ctx, name)
        services.save_scores(actor=ctx["tu"], assessment=a, items=[{"student_id": k.pk, "score": str(v)} for k in ctx["kids"]])


def test_cau_component_is_bound_to_trimester_number(ctx):
    cau = _assess(ctx, "CAU 1")
    assert cau.cau_number == 1 and cau.assessment_type.code == "CAU"
    cau.cau_number = 2
    with pytest.raises(DomainError) as exc:
        services.validate_cau(cau)
    assert exc.value.error_code == "CAU_TRIMESTER_MISMATCH"
    # A Trimestre-1 component cannot be used for a Trimestre-2 assessment.
    advance_trimester(actor=ctx["kur"], trimester=ctx["t1"], target="GRADING")
    advance_trimester(actor=ctx["kur"], trimester=ctx["t2"], target="ACTIVE")
    with pytest.raises(DomainError):
        services.create_assessment(
            actor=ctx["tu"],
            assignment=ctx["ta"],
            trimester=ctx["t2"],
            component=ctx["comps"]["CAU 1"],
            title="x",
            assessment_date=date(2030, 5, 5),
            max_score=Decimal("10"),
        )


def test_weight_total_must_be_100_before_activation(ctx):
    s = GradingScheme.objects.create(academic_year=ctx["year"], trimester=ctx["t2"], subject_offering=ctx["off"], name="x")
    from modules.assessments.models import AssessmentType

    GradingComponent.objects.create(
        grading_scheme=s,
        assessment_type=AssessmentType.objects.get(code="CAU"),
        name="CAU",
        weight_percent=Decimal("90"),
        is_cau_component=True,
    )
    with pytest.raises(DomainError) as exc:
        services.activate_scheme(actor=ctx["kur"], scheme=s)
    assert exc.value.error_code == "GRADING_WEIGHT_INVALID"


def test_score_above_max_rejected_and_unenrolled_rejected(ctx, make_user):
    a = _assess(ctx, "TPC")
    with pytest.raises(DomainError) as exc:
        services.save_scores(actor=ctx["tu"], assessment=a, items=[{"student_id": ctx["kids"][0].pk, "score": "10.5"}])
    assert exc.value.details["rows"][str(ctx["kids"][0].pk)]["code"] == "ASSESSMENT_SCORE_OUT_OF_RANGE"
    stranger = students.create_student(actor=ctx["kur"], data={"full_name": "Lain", "birth_date": date(2014, 2, 2)})
    with pytest.raises(DomainError):
        services.save_scores(actor=ctx["tu"], assessment=a, items=[{"student_id": stranger.pk, "score": "5"}])
    assert not StudentScore.objects.exists()  # all-or-nothing


def test_unassigned_teacher_denied(ctx):
    a = _assess(ctx, "TPC")
    with pytest.raises(DomainError) as exc:
        services.save_scores(actor=ctx["other"], assessment=a, items=[{"student_id": ctx["kids"][0].pk, "score": "5"}])
    assert exc.value.error_code == "PERMISSION_DENIED"
    api = APIClient()
    api.force_authenticate(ctx["other"])
    assert api.get(f"/api/v1/gradebook/?teaching_assignment_id={ctx['ta'].pk}&trimester_id={ctx['t1'].pk}").status_code == 404


def test_locked_assessment_rejects_write_and_closed_needs_revision_reason(ctx):
    a = _assess(ctx, "TPC")
    kid = ctx["kids"][0]
    services.save_scores(actor=ctx["tu"], assessment=a, items=[{"student_id": kid.pk, "score": "6"}])
    services.set_assessment_status(actor=ctx["tu"], assessment=a, target="CLOSED")
    with pytest.raises(DomainError):
        services.save_scores(actor=ctx["tu"], assessment=a, items=[{"student_id": kid.pk, "score": "7"}])  # no reason
    services.save_scores(actor=ctx["tu"], assessment=a, items=[{"student_id": kid.pk, "score": "7", "reason": "Salah input"}])
    row = StudentScore.objects.get(assessment=a, student=kid)
    assert row.score == Decimal("7.00") and row.revisions.count() == 1
    assert AuditLog.objects.filter(event_type="SCORE_REVISED").exists()
    services.set_assessment_status(actor=ctx["tu"], assessment=a, target="LOCKED")
    with pytest.raises(DomainError) as exc:
        services.save_scores(actor=ctx["tu"], assessment=a, items=[{"student_id": kid.pk, "score": "8", "reason": "x"}])
    assert exc.value.error_code == "ASSESSMENT_LOCKED"


def test_finalize_requires_complete_and_finalized_does_not_silently_change(ctx):
    a = _assess(ctx, "TPC")
    services.save_scores(actor=ctx["tu"], assessment=a, items=[{"student_id": k.pk, "score": "8"} for k in ctx["kids"]])
    with pytest.raises(DomainError) as exc:
        services.finalize(actor=ctx["tu"], assignment=ctx["ta"], trimester=ctx["t1"])
    assert exc.value.error_code == "REPORT_NOT_READY"
    for name, v in (("Teste 1", 6), ("Teste 2", 7), ("CAU 1", 5)):
        x = _assess(ctx, name)
        services.save_scores(actor=ctx["tu"], assessment=x, items=[{"student_id": k.pk, "score": str(v)} for k in ctx["kids"]])
    assert services.finalize(actor=ctx["tu"], assignment=ctx["ta"], trimester=ctx["t1"]) == 3
    tg = TermGrade.objects.get(student=ctx["kids"][0], trimester=ctx["t1"])
    assert tg.final_score == Decimal("6.35") and tg.grade_label == "APROVADO"
    with pytest.raises(DomainError) as exc:
        services.save_scores(actor=ctx["tu"], assessment=a, items=[{"student_id": ctx["kids"][0].pk, "score": "1", "reason": "x"}])
    assert exc.value.details["rows"][str(ctx["kids"][0].pk)]["code"] == "TERM_GRADE_FINALIZED"
    tg.refresh_from_db()
    assert tg.final_score == Decimal("6.35")


def test_reopen_requires_permission_reason_and_audit(ctx):
    _full_scores(ctx)
    services.finalize(actor=ctx["tu"], assignment=ctx["ta"], trimester=ctx["t1"])
    tg = TermGrade.objects.filter(trimester=ctx["t1"]).first()
    with pytest.raises(DomainError):
        services.reopen(actor=ctx["tu"], term_grade=tg, reason="x")  # teacher lacks grade.reopen
    with pytest.raises(DomainError) as exc:
        services.reopen(actor=ctx["kur"], term_grade=tg, reason=" ")
    assert exc.value.error_code == "TERM_GRADE_REOPEN_REASON_REQUIRED"
    services.reopen(actor=ctx["kur"], term_grade=tg, reason="Koreksi CAU")
    assert AuditLog.objects.filter(event_type="TERM_GRADE_REOPENED").exists()


def test_reporting_flow_incomplete_blocks_publish_and_revision_keeps_old(ctx, django_capture_on_commit_callbacks):
    advance_trimester(actor=ctx["kur"], trimester=ctx["t1"], target="GRADING")
    reports.generate(actor=ctx["tu"], classroom=ctx["cls"], trimester=ctx["t1"])
    drafts = list(ReportCard.objects.filter(trimester=ctx["t1"]))
    with pytest.raises(DomainError) as exc:
        reports.publish(actor=ctx["kur"], reports=drafts)
    assert exc.value.error_code == "REPORT_NOT_READY"
    _full_scores_grading(ctx)
    services.finalize(actor=ctx["tu"], assignment=ctx["ta"], trimester=ctx["t1"])
    reports.generate(actor=ctx["tu"], classroom=ctx["cls"], trimester=ctx["t1"])
    rc = ReportCard.objects.filter(trimester=ctx["t1"], student=ctx["kids"][0]).first()
    with django_capture_on_commit_callbacks(execute=True):
        assert reports.publish(actor=ctx["kur"], reports=[rc])["published"] == 1
    rc.refresh_from_db()
    assert rc.pdf_file_id and rc.snapshot["subjects"][0]["final_score"] == "6.3500"
    with pytest.raises(DomainError):
        reports.review(actor=ctx["tu"], report=rc, homeroom_note="ubah")  # published is immutable
    new = reports.reopen(actor=ctx["kur"], report=rc, reason="Salah nama")
    rc.refresh_from_db()
    assert rc.status == "REOPENED" and rc.pdf_file_id and new.revision_no == 2
    assert reports.publish(actor=ctx["kur"], reports=[new])["published"] == 1


def _full_scores_grading(ctx):
    # Grade entry still allowed in GRADING status (within the window / for curriculum).
    names = ["TPC", "Teste 1", "Teste 2", "CAU 1"]
    for name, v in zip(names, (8, 6, 7, 5), strict=True):
        a = Assessment.objects.filter(title=name, trimester=ctx["t1"]).first() or services.create_assessment(
            actor=ctx["kur"],
            assignment=ctx["ta"],
            trimester=ctx["t1"],
            component=ctx["comps"][name],
            title=name,
            assessment_date=date(2030, 2, 1),
            max_score=Decimal("10"),
        )
        services.save_scores(actor=ctx["kur"], assessment=a, items=[{"student_id": k.pk, "score": str(v)} for k in ctx["kids"]])


def test_guardian_and_student_see_only_own_published_reports(ctx, make_user):
    advance_trimester(actor=ctx["kur"], trimester=ctx["t1"], target="GRADING")
    _full_scores_grading(ctx)
    services.finalize(actor=ctx["tu"], assignment=ctx["ta"], trimester=ctx["t1"])
    reports.generate(actor=ctx["tu"], classroom=ctx["cls"], trimester=ctx["t1"])
    reports.publish(actor=ctx["kur"], reports=list(ReportCard.objects.filter(trimester=ctx["t1"])))
    a, b = ctx["kids"][0], ctx["kids"][1]
    su = make_user("siswa", roles=["STUDENT"])
    a.user = su
    a.save()
    api = APIClient()
    api.force_authenticate(su)
    mine = api.get("/api/v1/report-cards/").json()["data"]
    assert [r["student"] for r in mine] == [str(a.pk)]
    other = ReportCard.objects.get(student=b, trimester=ctx["t1"])
    assert api.get(f"/api/v1/report-cards/{other.pk}/download/").status_code == 404
    assert api.get(f"/api/v1/report-cards/{mine[0]['id']}/download/").status_code == 200


def test_promotion_major_change_reason_and_graduation(ctx, make_user):
    for t in (ctx["t1"],):
        advance_trimester(actor=ctx["kur"], trimester=t, target="GRADING")
    nxt = make_year(name="2031", start=date(2031, 1, 6), end=date(2031, 12, 5), trimesters=False)
    xi_ipa = make_class(nxt, "XI-IPA-1", "XI", "IPA")
    xi_ips = make_class(nxt, "XI-IPS-1", "XI", "IPS")
    principal = make_user("dir", roles=["PRINCIPAL"])
    kid = ctx["kids"][0]
    with pytest.raises(DomainError) as exc:
        reports.execute_promotion(actor=principal, year=ctx["year"], student=kid, decision="PROMOTED", target_classroom=xi_ipa)
    assert exc.value.error_code == "PROMOTION_INVALID_STATE"  # T3 not finished
    principal_kur = make_user("kur2", roles=["CURRICULUM_ADMIN"])
    with pytest.raises(DomainError) as exc:
        reports.execute_promotion(
            actor=principal_kur,
            year=ctx["year"],
            student=kid,
            decision="PROMOTED",
            target_classroom=xi_ips,
            target_major=xi_ips.major,
            override_incomplete=True,
            reason="",
        )
    d, created = reports.execute_promotion(
        actor=principal_kur,
        year=ctx["year"],
        student=kid,
        decision="PROMOTED",
        target_classroom=xi_ips,
        target_major=xi_ips.major,
        override_incomplete=True,
        reason="Minat IPS, disetujui orang tua",
    )
    assert created and d.to_enrollment.classroom == xi_ips
    again, created_again = reports.execute_promotion(
        actor=principal_kur,
        year=ctx["year"],
        student=kid,
        decision="PROMOTED",
        target_classroom=xi_ipa,
        override_incomplete=True,
        reason="x",
    )
    assert again.pk == d.pk and not created_again  # idempotent: no duplicate next-year enrollment
    assert kid.enrollments.filter(status="ACTIVE").count() == 1
    xii = GradeLevel.objects.get(code="XII")
    xii_cls = make_class(ctx["year"], "XII-IPA-1", "XII", "IPA")
    assert xii_cls.grade_level == xii
    grad = students.create_student(actor=ctx["kur"], data={"full_name": "Finalista", "birth_date": date(2010, 1, 1)}, classroom=xii_cls)
    reports.execute_promotion(
        actor=principal_kur, year=ctx["year"], student=grad, decision="GRADUATED", override_incomplete=True, reason="Selesai"
    )
    grad.refresh_from_db()
    assert grad.status == "GRADUATED" and not grad.enrollments.filter(status="ACTIVE").exists()
    assert grad.enrollments.get().status == "COMPLETED"

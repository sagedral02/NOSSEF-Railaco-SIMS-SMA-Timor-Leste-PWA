"""Canonical reports (PRD §33.3). Each builder applies the same permission + object scope as the matching screen/API
(§32.3), returning (headers, rows). Parameters are validated per report; unknown keys are ignored."""

from dataclasses import dataclass, field
from datetime import date

from django.db.models import Count, Q, Sum
from django.utils import timezone

from common.api.exceptions import DomainError, ErrorCode
from common.permissions import user_has_global, user_has_perm

REPORTS = {}


@dataclass
class Report:
    code: str
    title: str
    domain: str
    perms: tuple
    params: tuple = ()
    pii: bool = True
    formats: tuple = ("CSV", "XLSX", "PDF")
    build: object = field(default=None, repr=False)


def report(code, title, domain, perms, params=(), pii=True):
    def deco(fn):
        REPORTS[code] = Report(code, title, domain, perms if isinstance(perms, tuple) else (perms,), params, pii, build=fn)
        return fn

    return deco


def allowed(user, rep):
    return any(user_has_perm(user, p) for p in rep.perms)


def _year(p):
    from modules.academics.models import AcademicYear

    y = AcademicYear.objects.filter(pk=p.get("academic_year_id")).first() if p.get("academic_year_id") else None
    return y or AcademicYear.objects.filter(is_current=True).first()


def _need(p, key):
    if not p.get(key):
        raise DomainError(ErrorCode.VALIDATION_ERROR, "Data tidak valid.", fields={key: ["Wajib."]})
    return p[key]


def _d(v, default):
    try:
        return date.fromisoformat(v) if v else default
    except ValueError:
        raise DomainError(ErrorCode.VALIDATION_ERROR, "Data tidak valid.", fields={"date": ["Format YYYY-MM-DD."]})


def _students(user, perm="student.view"):
    from modules.students.selectors import students_visible_to

    return students_visible_to(user, perm)


# ------------------------------------------------------------------ admission


@report("ADM-01", "Daftar pendaftar", "Admission", "admission.view", ("admission_period_id", "status"))
def adm_01(user, p):
    from modules.admissions.models import Applicant

    qs = Applicant.objects.select_related("admission_period", "desired_major").order_by("registration_no")
    if v := p.get("admission_period_id"):
        qs = qs.filter(admission_period_id=v)
    if v := p.get("status"):
        qs = qs.filter(status=v)
    return ["No. pendaftaran", "Nama", "Tgl lahir", "Sekolah asal", "Jurusan pilihan", "Status", "Diajukan"], [
        [a.registration_no, a.full_name, a.birth_date, a.previous_school, getattr(a.desired_major, "code", ""), a.status, a.submitted_at]
        for a in qs
    ]


@report("ADM-02", "Hasil seleksi", "Admission", "admission.view", ("admission_period_id",))
def adm_02(user, p):
    from modules.admissions.models import AdmissionDecision

    qs = AdmissionDecision.objects.select_related("applicant").order_by("rank", "applicant__full_name")
    if v := p.get("admission_period_id"):
        qs = qs.filter(applicant__admission_period_id=v)
    return ["No. pendaftaran", "Nama", "Keputusan", "Skor", "Peringkat", "Tanggal"], [
        [d.applicant.registration_no, d.applicant.full_name, d.decision, d.score, d.rank, d.decided_at] for d in qs
    ]


# ------------------------------------------------------------------ students


@report("STU-01", "Siswa aktif per rombel", "Student", ("student.view", "student.export"), ("academic_year_id", "classroom_id"))
def stu_01(user, p):
    from modules.students.models import StudentEnrollment

    y = _year(p)
    qs = (
        StudentEnrollment.objects.filter(academic_year=y, status="ACTIVE", student__in=_students(user))
        .select_related("student", "classroom", "major", "grade_level")
        .order_by("classroom__code", "student__full_name")
    )
    if v := p.get("classroom_id"):
        qs = qs.filter(classroom_id=v)
    return ["Rombel", "NIS", "Nama", "L/P", "Tgl lahir", "Tingkat", "Jurusan"], [
        [
            e.classroom.name,
            e.student.student_no,
            e.student.full_name,
            e.student.gender,
            e.student.birth_date,
            e.grade_level.code,
            e.major.code,
        ]
        for e in qs
    ]


@report("STU-02", "Rekap siswa per tingkat/jurusan", "Student", ("student.view", "student.export"), ("academic_year_id",), pii=False)
def stu_02(user, p):
    from modules.students.models import StudentEnrollment

    y = _year(p)
    rows = (
        StudentEnrollment.objects.filter(academic_year=y, status="ACTIVE", student__in=_students(user))
        .values("grade_level__code", "major__code")
        .annotate(total=Count("id"), male=Count("id", filter=Q(student__gender="M")), female=Count("id", filter=Q(student__gender="F")))
        .order_by("grade_level__code", "major__code")
    )
    return ["Tingkat", "Jurusan", "Total", "L", "P"], [
        [r["grade_level__code"], r["major__code"], r["total"], r["male"], r["female"]] for r in rows
    ]


@report("STU-03", "Riwayat enrollment", "Student", ("student.view", "student.export"), ("student_id",))
def stu_03(user, p):
    from modules.students.models import StudentEnrollment

    qs = (
        StudentEnrollment.objects.filter(student__in=_students(user))
        .select_related("student", "academic_year", "classroom")
        .order_by("student__full_name", "start_date")
    )
    if v := p.get("student_id"):
        qs = qs.filter(student_id=v)
    return ["NIS", "Nama", "Tahun", "Rombel", "Status", "Mulai", "Selesai", "Sumber"], [
        [e.student.student_no, e.student.full_name, e.academic_year.name, e.classroom.name, e.status, e.start_date, e.end_date, e.source]
        for e in qs
    ]


# ------------------------------------------------------------------ attendance


@report("ATT-01", "Kehadiran harian", "Attendance", "attendance.view", ("date", "classroom_id"))
def att_01(user, p):
    from modules.attendance.models import AttendanceRecord

    d = _d(p.get("date"), timezone.localdate())
    qs = AttendanceRecord.objects.filter(
        session__date=d, session__session_type="DAILY", student__in=_students(user, "attendance.view")
    ).select_related("student", "session__classroom")
    if v := p.get("classroom_id"):
        qs = qs.filter(session__classroom_id=v)
    return ["Tanggal", "Rombel", "NIS", "Nama", "Status", "Menit terlambat", "Catatan"], [
        [d, r.session.classroom.name, r.student.student_no, r.student.full_name, r.status, r.minutes_late, r.note]
        for r in qs.order_by("session__classroom__code", "student__full_name")
    ]


def _att_counts(user, p):
    from modules.attendance.models import AttendanceRecord

    qs = AttendanceRecord.objects.filter(
        session__status__in=["SUBMITTED", "LOCKED"], session__session_type="DAILY", student__in=_students(user, "attendance.view")
    )
    if v := p.get("trimester_id"):
        qs = qs.filter(session__trimester_id=v)
    else:
        qs = qs.filter(session__academic_year=_year(p))
    if v := p.get("classroom_id"):
        qs = qs.filter(session__classroom_id=v)
    return (
        qs.values("student_id", "student__student_no", "student__full_name", "session__classroom__name")
        .annotate(
            total=Count("id"),
            present=Count("id", filter=Q(status="PRESENT")),
            late=Count("id", filter=Q(status="LATE")),
            sick=Count("id", filter=Q(status="SICK")),
            permitted=Count("id", filter=Q(status="PERMITTED")),
            absent=Count("id", filter=Q(status="ABSENT")),
        )
        .order_by("session__classroom__name", "student__full_name")
    )


def _rate(r):
    return round((r["present"] + r["late"]) * 100 / r["total"], 1) if r["total"] else None


@report("ATT-02", "Kehadiran per siswa/trimestre", "Attendance", "attendance.view", ("academic_year_id", "trimester_id", "classroom_id"))
def att_02(user, p):
    rows = _att_counts(user, p)
    return ["Rombel", "NIS", "Nama", "Hari", "Hadir", "Terlambat", "Sakit", "Izin", "Alpa", "% hadir"], [
        [
            r["session__classroom__name"],
            r["student__student_no"],
            r["student__full_name"],
            r["total"],
            r["present"],
            r["late"],
            r["sick"],
            r["permitted"],
            r["absent"],
            _rate(r),
        ]
        for r in rows
    ]


@report("ATT-03", "Ketidakhadiran kronis (<90%)", "Attendance", "attendance.view", ("academic_year_id", "trimester_id", "threshold"))
def att_03(user, p):
    threshold = float(p.get("threshold") or 90)
    rows = [r for r in _att_counts(user, p) if r["total"] and _rate(r) < threshold]
    return ["Rombel", "NIS", "Nama", "Hari", "Alpa", "Sakit", "Izin", "% hadir"], [
        [
            r["session__classroom__name"],
            r["student__student_no"],
            r["student__full_name"],
            r["total"],
            r["absent"],
            r["sick"],
            r["permitted"],
            _rate(r),
        ]
        for r in sorted(rows, key=_rate)
    ]


# ------------------------------------------------------------------ academic / schedule


@report("ACA-01", "Penugasan mengajar", "Academic", "academic.view", ("academic_year_id",), pii=False)
def aca_01(user, p):
    from modules.academics.models import TeachingAssignment

    qs = (
        TeachingAssignment.objects.filter(academic_year=_year(p))
        .select_related("classroom", "teacher", "subject_offering__subject")
        .order_by("classroom__code", "subject_offering__subject__code")
    )
    return ["Rombel", "Mapel", "Nama mapel", "Guru", "JP/minggu", "Aktif"], [
        [
            t.classroom.name,
            t.subject_offering.subject.code,
            t.subject_offering.subject.name,
            t.teacher.full_name,
            t.subject_offering.weekly_periods,
            t.active,
        ]
        for t in qs
    ]


def _schedule(p, **flt):
    from modules.schedules.models import ScheduleEntry

    days = ["", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"]
    qs = ScheduleEntry.objects.filter(academic_year=_year(p), active=True, **flt).select_related(
        "classroom", "bell_period", "room", "teaching_assignment__teacher", "teaching_assignment__subject_offering__subject"
    )
    return ["Hari", "Jam", "Mulai", "Selesai", "Rombel", "Mapel", "Guru", "Ruang"], [
        [
            days[e.weekday],
            e.bell_period.name,
            e.bell_period.start_time,
            e.bell_period.end_time,
            e.classroom.name,
            e.teaching_assignment.subject_offering.subject.code,
            e.teaching_assignment.teacher.full_name,
            getattr(e.room, "code", ""),
        ]
        for e in qs.order_by("weekday", "bell_period__sequence", "classroom__code")
    ]


@report("ACA-02", "Jadwal per rombel", "Schedule", "schedule.view", ("academic_year_id", "classroom_id"), pii=False)
def aca_02(user, p):
    return _schedule(p, classroom_id=_need(p, "classroom_id"))


@report("ACA-03", "Jadwal per guru", "Schedule", "schedule.view", ("academic_year_id", "teacher_id"), pii=False)
def aca_03(user, p):
    return _schedule(p, teaching_assignment__teacher_id=_need(p, "teacher_id"))


# ------------------------------------------------------------------ grades / reports


def _assignment(user, p):
    from modules.academics.models import TeachingAssignment
    from modules.assessments.services import can_view_assignment

    ta = (
        TeachingAssignment.objects.filter(pk=_need(p, "teaching_assignment_id"))
        .select_related("classroom", "subject_offering__subject")
        .first()
    )
    if ta is None or not can_view_assignment(user, ta):
        raise DomainError(ErrorCode.RESOURCE_NOT_FOUND, "Data tidak ditemukan.", status_code=404)
    return ta


@report("GRD-01", "Lembar nilai penilaian", "Grade", "assessment.view", ("teaching_assignment_id", "trimester_id"))
def grd_01(user, p):
    from modules.academics.models import Trimester
    from modules.assessments import services
    from modules.assessments.models import Assessment, StudentScore

    ta = _assignment(user, p)
    tr = Trimester.objects.get(pk=_need(p, "trimester_id"))
    items = list(Assessment.objects.filter(teaching_assignment=ta, trimester=tr).order_by("grading_component__sequence", "assessment_date"))
    scores = {(s.assessment_id, s.student_id): s for s in StudentScore.objects.filter(assessment__in=items)}
    out = []
    for st in services.roster(ta, tr):
        row = [st.student_no, st.full_name]
        for a in items:
            s = scores.get((a.pk, st.pk))
            row.append(s.score if s and s.status == "GRADED" else (s.status if s else ""))
        out.append(row)
    return ["NIS", "Nama", *[f"{a.title} (/{a.max_score})" for a in items]], out


@report("GRD-02", "Kelengkapan CAU/nilai", "Grade", "assessment.view", ("trimester_id",), pii=False)
def grd_02(user, p):
    from modules.academics.models import Trimester
    from modules.academics.selectors import homeroom_classroom_ids
    from modules.assessments.services import completion

    tr = Trimester.objects.get(pk=_need(p, "trimester_id"))
    scope = None if user_has_global(user, "assessment.view") else homeroom_classroom_ids(user)
    rows = completion(tr, scope)
    return ["Rombel", "Mapel", "Guru", "Skema", "Penilaian", "Final", "Siswa", "%"], [
        [
            r["classroom"],
            r["subject_code"],
            r["teacher"],
            "Ya" if r["has_scheme"] else "Tidak",
            r["assessments"],
            r["finalized"],
            r["expected"],
            round(r["finalized"] * 100 / r["expected"], 1) if r["expected"] else 0,
        ]
        for r in rows
    ]


@report("GRD-03", "Register nilai akhir", "Grade", "assessment.view", ("trimester_id", "classroom_id"))
def grd_03(user, p):
    from modules.assessments.models import TermGrade

    qs = TermGrade.objects.filter(trimester_id=_need(p, "trimester_id"), student__in=_students(user, "assessment.view")).select_related(
        "student", "teaching_assignment__classroom", "teaching_assignment__subject_offering__subject"
    )
    if v := p.get("classroom_id"):
        qs = qs.filter(teaching_assignment__classroom_id=v)
    return ["Rombel", "NIS", "Nama", "Mapel", "Nilai hitung", "Nilai akhir", "Predikat", "Status"], [
        [
            g.teaching_assignment.classroom.name,
            g.student.student_no,
            g.student.full_name,
            g.teaching_assignment.subject_offering.subject.code,
            g.calculated_score,
            g.final_score,
            g.grade_label,
            g.status,
        ]
        for g in qs.order_by(
            "teaching_assignment__classroom__code", "student__full_name", "teaching_assignment__subject_offering__subject__code"
        )
    ]


def _reports_scope(user):
    from modules.report_cards.api.views import visible_reports

    return visible_reports(user).filter(status="PUBLISHED")


@report("RPT-01", "Rapor per siswa", "Report", "report.view", ("student_id", "trimester_id"))
def rpt_01(user, p):
    qs = _reports_scope(user).filter(student_id=_need(p, "student_id"))
    if v := p.get("trimester_id"):
        qs = qs.filter(trimester_id=v)
    return _report_rows(qs)


@report("RPT-02", "Rapor massal per rombel", "Report", "report.view", ("classroom_id", "trimester_id"))
def rpt_02(user, p):
    return _report_rows(
        _reports_scope(user).filter(enrollment__classroom_id=_need(p, "classroom_id"), trimester_id=_need(p, "trimester_id"))
    )


def _report_rows(qs):
    rows = []
    for r in qs.order_by("student__full_name", "trimester__number"):
        for s in r.snapshot.get("subjects", []):
            rows.append(
                [
                    r.snapshot.get("classroom"),
                    r.snapshot.get("student_no"),
                    r.snapshot.get("student_name"),
                    f"T{r.snapshot.get('trimester')}",
                    s["subject_code"],
                    s.get("cau_score"),
                    s["final_score"],
                    s["grade_label"],
                    r.revision_no,
                ]
            )
    return ["Rombel", "NIS", "Nama", "Trimestre", "Mapel", "CAU", "Nilai akhir", "Predikat", "Revisi"], rows


@report("RPT-03", "Transkrip", "Report", "report.view", ("student_id",))
def rpt_03(user, p):
    from modules.report_cards.services import transcript

    st = _students(user, "report.view").filter(pk=_need(p, "student_id")).first()
    if st is None:
        raise DomainError(ErrorCode.RESOURCE_NOT_FOUND, "Data tidak ditemukan.", status_code=404)
    rows = []
    for y in transcript(st):
        for s in y["subjects"]:
            rows.append(
                [
                    y["academic_year"],
                    y["classroom"],
                    s["subject_code"],
                    s["subject_name"],
                    s["trimesters"].get("1"),
                    s["trimesters"].get("2"),
                    s["trimesters"].get("3"),
                    s["annual"],
                ]
            )
    return ["Tahun", "Rombel", "Mapel", "Nama mapel", "T1", "T2", "T3", "Akhir tahun"], rows


# ------------------------------------------------------------------ finance


def _fin(user):
    from modules.finance.selectors import finance_students

    return finance_students(user)


@report("FIN-01", "Register tagihan", "Finance", ("finance.view", "finance.export"), ("academic_year_id", "billing_period", "status"))
def fin_01(user, p):
    from modules.finance.models import Invoice

    qs = Invoice.objects.filter(student__in=_fin(user), academic_year=_year(p)).select_related("student")
    for k in ("billing_period", "status"):
        if v := p.get(k):
            qs = qs.filter(**{k: v})
    return ["No. tagihan", "NIS", "Nama", "Periode", "Terbit", "Jatuh tempo", "Subtotal", "Diskon", "Total", "Dibayar", "Sisa", "Status"], [
        [
            i.invoice_no,
            i.student.student_no,
            i.student.full_name,
            i.billing_period,
            i.issue_date,
            i.due_date,
            i.subtotal,
            i.discount_total,
            i.total,
            i.paid_amount,
            i.balance,
            i.status,
        ]
        for i in qs.order_by("billing_period", "student__full_name")
    ]


@report("FIN-02", "Pembayaran per periode", "Finance", ("finance.view", "finance.export"), ("date_from", "date_to", "method"))
def fin_02(user, p):
    from modules.finance.models import Payment

    today = timezone.localdate()
    qs = Payment.objects.filter(
        student__in=_fin(user),
        payment_date__date__gte=_d(p.get("date_from"), today.replace(day=1)),
        payment_date__date__lte=_d(p.get("date_to"), today),
    ).select_related("student", "received_by")
    if v := p.get("method"):
        qs = qs.filter(method=v)
    return ["No. bayar", "Tanggal", "NIS", "Nama", "Metode", "Referensi", "Nominal", "Status", "Petugas"], [
        [
            x.payment_no,
            timezone.localtime(x.payment_date),
            x.student.student_no,
            x.student.full_name,
            x.method,
            x.reference_no,
            x.amount,
            x.status,
            getattr(x.received_by, "username", ""),
        ]
        for x in qs.order_by("payment_date")
    ]


def _arrears(user, p):
    from modules.finance.models import Invoice

    today = timezone.localdate()
    return (
        Invoice.objects.filter(student__in=_fin(user), academic_year=_year(p), status__in=["UNPAID", "PARTIALLY_PAID"])
        .values("student_id", "student__student_no", "student__full_name")
        .annotate(owed=Sum("balance"), overdue=Sum("balance", filter=Q(due_date__lt=today)), n=Count("id"))
    )


def _classes():
    from modules.students.models import StudentEnrollment

    return {e.student_id: e.classroom.name for e in StudentEnrollment.objects.filter(status="ACTIVE").select_related("classroom")}


@report("FIN-03", "Tunggakan per siswa", "Finance", ("finance.view", "finance.export"), ("academic_year_id",))
def fin_03(user, p):
    cls = _classes()
    rows = sorted(_arrears(user, p), key=lambda r: -(r["owed"] or 0))
    return ["NIS", "Nama", "Rombel", "Tagihan terbuka", "Sisa", "Lewat jatuh tempo"], [
        [r["student__student_no"], r["student__full_name"], cls.get(r["student_id"], ""), r["n"], r["owed"], r["overdue"] or 0]
        for r in rows
    ]


@report("FIN-04", "Tunggakan per rombel", "Finance", ("finance.view", "finance.export"), ("academic_year_id",), pii=False)
def fin_04(user, p):
    cls = _classes()
    agg = {}
    for r in _arrears(user, p):
        c = agg.setdefault(cls.get(r["student_id"], "-"), [0, 0, 0])
        c[0] += 1
        c[1] += r["owed"] or 0
        c[2] += r["overdue"] or 0
    return ["Rombel", "Siswa menunggak", "Sisa", "Lewat jatuh tempo"], [[k, v[0], v[1], v[2]] for k, v in sorted(agg.items())]


@report("FIN-05", "Rekening siswa", "Finance", ("finance.view",), ("student_id",))
def fin_05(user, p):
    from modules.finance.services import statement

    st = _fin(user).filter(pk=_need(p, "student_id")).first()
    if st is None:
        raise DomainError(ErrorCode.RESOURCE_NOT_FOUND, "Data tidak ditemukan.", status_code=404)
    s = statement(st)
    return ["Tanggal", "Jenis", "Ref", "Keterangan", "Debit", "Kredit", "Saldo"], [
        [e["date"], e["type"], e["ref"], e["description"], e["debit"], e["credit"], e["balance"]] for e in s["entries"]
    ]


@report("FIN-06", "Kas harian", "Finance", ("finance.view", "finance.receive_payment"), ("date",), pii=False)
def fin_06(user, p):
    from modules.finance.models import Payment

    d = _d(p.get("date"), timezone.localdate())
    rows = (
        Payment.objects.filter(status="VERIFIED", verified_at__date=d)
        .values("received_by__username", "method")
        .annotate(n=Count("id"), total=Sum("amount"))
        .order_by("received_by__username", "method")
    )
    return ["Tanggal", "Petugas", "Metode", "Transaksi", "Total"], [
        [d, r["received_by__username"] or "-", r["method"], r["n"], r["total"]] for r in rows
    ]


# ------------------------------------------------------------------ library / assets / BK / extracurricular


@report("LIB-01", "Pinjaman aktif/terlambat", "Library", ("library.view", "library.issue"), ("overdue_only",))
def lib_01(user, p):
    from modules.library.api.views import visible_loans
    from modules.library.services import refresh_overdue

    refresh_overdue()
    qs = visible_loans(user).filter(status__in=["OVERDUE"] if p.get("overdue_only") in (True, "1", "true") else ["OPEN", "OVERDUE"])
    return ["Barcode", "Judul", "Peminjam", "Dipinjam", "Jatuh tempo", "Status"], [
        [
            x.copy.barcode,
            x.copy.book.title,
            x.student.full_name if x.student_id else x.teacher.full_name,
            timezone.localtime(x.borrowed_at).date(),
            timezone.localtime(x.due_at).date(),
            x.status,
        ]
        for x in qs.order_by("due_at")
    ]


@report("AST-01", "Register aset", "Asset", "asset.view", ("status", "category"), pii=False)
def ast_01(user, p):
    from modules.assets.models import Asset

    qs = Asset.objects.select_related("location_room").prefetch_related("assignments__teacher", "assignments__staff", "assignments__room")
    for k in ("status", "category"):
        if v := p.get(k):
            qs = qs.filter(**{k: v})
    rows = []
    for a in qs.order_by("asset_no"):
        cur = next((x for x in a.assignments.all() if x.returned_at is None), None)
        holder = (cur.teacher or cur.staff or cur.room) if cur else None
        rows.append(
            [
                a.asset_no,
                a.name,
                a.category,
                a.serial_no,
                a.purchase_date,
                a.purchase_cost,
                getattr(a.location_room, "code", ""),
                a.condition,
                a.status,
                getattr(holder, "full_name", None) or getattr(holder, "code", ""),
            ]
        )
    return ["Kode", "Nama", "Kategori", "No. seri", "Tgl beli", "Nilai", "Lokasi", "Kondisi", "Status", "Pemegang"], rows


@report("BK-01", "Agregat kasus BK", "Counseling", ("counseling.view",), (), pii=False)
def bk_01(user, p):
    from modules.counseling.models import CounselingCase

    rows = (
        CounselingCase.objects.values("category", "severity", "status").annotate(n=Count("id")).order_by("category", "severity", "status")
    )
    return ["Kategori", "Tingkat", "Status", "Jumlah"], [[r["category"], r["severity"], r["status"], r["n"]] for r in rows]


@report("EXT-01", "Peserta ekstrakurikuler", "Extracurricular", "extracurricular.view", ("academic_year_id",))
def ext_01(user, p):
    from modules.extracurricular.models import ExtracurricularMembership

    qs = ExtracurricularMembership.objects.filter(activity__academic_year=_year(p)).select_related("activity", "student")
    if not user_has_global(user, "extracurricular.view"):
        qs = qs.filter(student__in=_students(user))
    return ["Kegiatan", "NIS", "Nama", "Status", "Bergabung", "Keluar", "Peran"], [
        [m.activity.name, m.student.student_no, m.student.full_name, m.status, m.joined_at, m.left_at, m.role]
        for m in qs.order_by("activity__name", "student__full_name")
    ]

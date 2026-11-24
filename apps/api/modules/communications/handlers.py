"""Domain event → notification mapping (PRD §30.2). Bodies are generic: no grades, amounts or internal notes."""

from common.events import subscribe

from .services import guardian_users, notify, student_users


def _family(student_id):
    return guardian_users([student_id]) | student_users([student_id])


def _payment_student(payment_id):
    from modules.finance.models import Payment

    p = Payment.objects.filter(pk=payment_id).only("student_id").first()
    return p.student_id if p else None


@subscribe("attendance.absent")
def on_absent(record_id, student_id):
    notify(
        guardian_users([student_id]),
        type="attendance.absent",
        title="Ketidakhadiran siswa",
        body="Anak Anda tercatat tidak hadir hari ini.",
        target_url="/dashboard",
        dedup_key=f"att-absent:{record_id}",
        push=True,
    )


@subscribe("attendance.late")
def on_late(record_id, student_id):
    notify(
        guardian_users([student_id]),
        type="attendance.late",
        title="Keterlambatan siswa",
        body="Anak Anda tercatat terlambat.",
        target_url="/dashboard",
        dedup_key=f"att-late:{record_id}",
    )


@subscribe("report_card.published")
def on_report(report_card_id, student_id):
    notify(
        _family(student_id),
        type="report_card.published",
        title="Rapor telah terbit",
        body="Rapor trimestre tersedia di portal.",
        target_url="/my/report-cards",
        dedup_key=f"report:{report_card_id}",
        push=True,
    )


@subscribe("payment.verified")
def on_payment_verified(payment_id):
    if sid := _payment_student(payment_id):
        notify(
            _family(sid),
            type="finance.payment.verified",
            title="Pembayaran terverifikasi",
            body="Pembayaran telah diverifikasi. Kuitansi tersedia di portal.",
            target_url="/my/finance",
            dedup_key=f"pay-ok:{payment_id}",
            email=True,
        )


@subscribe("payment.reversed")
def on_payment_reversed(payment_id):
    if sid := _payment_student(payment_id):
        notify(
            _family(sid),
            type="finance.payment.reversed",
            title="Koreksi pembayaran",
            body="Ada koreksi pada riwayat pembayaran. Silakan cek portal.",
            target_url="/my/finance",
            dedup_key=f"pay-rev:{payment_id}",
            email=True,
        )


@subscribe("payment.rejected")
def on_payment_rejected(payment_id):
    if sid := _payment_student(payment_id):
        notify(
            _family(sid),
            type="finance.payment.rejected",
            title="Bukti transfer ditolak",
            body="Bukti transfer tidak dapat diverifikasi. Silakan cek portal.",
            target_url="/my/finance",
            dedup_key=f"pay-rej:{payment_id}",
        )


@subscribe("discipline.guardian_notice")
def on_notice(incident_id, student_id):
    notify(
        guardian_users([student_id]),
        type="discipline.notice",
        title="Pemberitahuan dari sekolah",
        body="Ada pemberitahuan baru dari sekolah.",
        target_url="/my/notices",
        dedup_key=f"notice:{incident_id}",
        push=True,
    )


@subscribe("schedule.changed")
def on_schedule(entry_id, date=None):
    from modules.schedules.models import ScheduleEntry
    from modules.students.models import Student

    e = ScheduleEntry.objects.filter(pk=entry_id).select_related("teaching_assignment__teacher", "teaching_assignment__classroom").first()
    if e is None:
        return
    ta = e.teaching_assignment
    users = {ta.teacher.user_id} if ta.teacher.user_id else set()
    ids = list(Student.objects.filter(enrollments__classroom=ta.classroom, enrollments__status="ACTIVE").values_list("pk", flat=True))
    users |= student_users(ids)
    stamp = date or e.updated_at.strftime("%Y%m%d%H%M%S")
    notify(
        users,
        type="schedule.changed",
        title="Perubahan jadwal",
        body=f"Jadwal kelas {ta.classroom.name} berubah.",
        target_url="/schedules",
        dedup_key=f"sched:{entry_id}:{stamp}",
    )

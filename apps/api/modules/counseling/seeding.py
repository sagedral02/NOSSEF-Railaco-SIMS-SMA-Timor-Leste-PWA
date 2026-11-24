"""Synthetic BK/discipline demo data (local only)."""

from datetime import timedelta

from django.db import transaction


@transaction.atomic
def seed_demo_counseling():
    from django.utils import timezone

    from common.seeding import assert_demo_allowed
    from modules.accounts.models import User
    from modules.students.models import Student

    from . import services
    from .models import CounselingCase

    assert_demo_allowed()
    if CounselingCase.objects.exists():
        return {"skipped": True}
    bk = User.objects.get(username="konselora")
    teacher = User.objects.get(username="agostinho.freitas")
    kids = list(Student.objects.filter(status="ACTIVE").order_by("student_no")[10:40])
    from modules.students.selectors import students_visible_to

    own = list(students_visible_to(teacher).filter(status="ACTIVE").order_by("student_no")[:8])
    now = timezone.now()
    cases = [
        ("Akademik", "MEDIUM", "Penurunan nilai beberapa mapel", "Siswa mengaku kesulitan mengikuti Matemátika; perlu jadwal belajar."),
        ("Kehadiran", "HIGH", "Sering tidak hadir hari Senin", "Membantu orang tua di kebun; dibahas dengan wali."),
        ("Sosial", "LOW", "Konflik ringan dengan teman sekelas", "Sudah dimediasi."),
        ("Keluarga", "HIGH", "Perubahan situasi keluarga", "Catatan rahasia demo."),
        ("Karier", "LOW", "Konsultasi pilihan studi lanjut", "Minat teknik sipil."),
    ]
    for i, (cat, sev, summ, det) in enumerate(cases):
        c = services.open_case(actor=bk, student=kids[i], category=cat, severity=sev, summary=summ, details=det)
        services.add_follow_up(actor=bk, case=c, note="Pertemuan awal dengan siswa (demo).", follow_up_at=now - timedelta(days=10 - i))
        if i == 1:
            services.log_guardian_contact(actor=bk, case=c, channel="PHONE", summary="Wali dihubungi; setuju pertemuan Jumat.")
        if i == 2:
            services.change_status(actor=bk, case=c, target="RESOLVED")
        if i == 4:
            services.change_status(actor=bk, case=c, target="CLOSED")
    incidents = [
        ("Terlambat", "LOW", "Halaman sekolah"),
        ("Tidak berseragam", "LOW", "Kelas"),
        ("Bolos pelajaran", "MEDIUM", "Kantin"),
        ("Perkelahian", "HIGH", "Lapangan"),
    ]
    for i, (cat, sev, loc) in enumerate(incidents * 2):
        inc = services.record_incident(
            actor=teacher if i % 2 else bk,
            student=own[i] if i % 2 else kids[10 + i],
            data={
                "occurred_at": now - timedelta(days=3 * i + 1),
                "category": cat,
                "severity": sev,
                "location": loc,
                "description": f"{cat} (demo).",
            },
        )
        if i == 3:
            services.update_incident(
                actor=bk,
                incident=inc,
                data={"action_type": "PARENT_MEETING", "action_taken": "Rapat dengan wali dijadwalkan.", "status": "RESOLVED"},
            )
            services.publish_guardian_notice(actor=bk, incident=inc, notice="Mohon hadir pertemuan dengan BK pada hari Jumat pukul 10.00.")
        if i == 6:
            services.void_incident(actor=bk, incident=inc, reason="Salah input siswa (demo)")
    return {"cases": len(cases), "incidents": len(incidents) * 2}

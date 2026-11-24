"""Student lifecycle services (PRD §17). All writes are transactional and audited."""

from datetime import timedelta

from django.db import IntegrityError, transaction
from django.utils import timezone

from common.api.exceptions import ConflictError, DomainError, ErrorCode
from common.events import emit
from common.models import next_number
from common.permissions import user_has_perm
from modules.audit import services as audit
from modules.audit.events import AuditEvent

from .models import (
    EnrollmentSource,
    EnrollmentStatus,
    Guardian,
    Student,
    StudentEnrollment,
    StudentGuardian,
    StudentStatus,
    StudentStatusHistory,
    StudentTransfer,
    TransferType,
)

STUDENT_FIELDS = ("full_name", "national_student_no", "birth_place", "birth_date", "gender", "address", "phone", "email", "admission_date")


def _snap(student):
    return {f: (str(getattr(student, f)) if getattr(student, f) is not None else None) for f in STUDENT_FIELDS} | {"status": student.status}


def generate_student_no(year: int) -> str:
    return f"NOS-{year}-{next_number(f'student_no:{year}'):04d}"


def enrollment_detail(enr):
    if enr is None:
        return None
    return {
        "academic_year": enr.academic_year.name,
        "grade": enr.grade_level.code,
        "major": enr.major.code,
        "classroom": enr.classroom.name,
        "classroom_id": str(enr.classroom_id),
    }


# ------------------------------------------------------------------ create / update


@transaction.atomic
def create_student(*, actor, data, classroom=None, start_date=None, source=EnrollmentSource.MANUAL):
    admission_date = data.get("admission_date") or timezone.localdate()
    student = Student(**{k: v for k, v in data.items() if k in STUDENT_FIELDS and k != "admission_date"}, admission_date=admission_date)
    student.student_no = data.get("student_no") or generate_student_no(admission_date.year)
    student.full_clean()
    student.save()
    StudentStatusHistory.objects.create(
        student=student,
        to_status=StudentStatus.ACTIVE,
        effective_date=admission_date,
        reason="Siswa baru",
        changed_by=actor if getattr(actor, "is_authenticated", False) else None,
    )
    audit.record(AuditEvent.STUDENT_CREATED, actor=actor, resource=student, after=_snap(student))
    if classroom is not None:
        enroll(actor=actor, student=student, classroom=classroom, start_date=start_date or admission_date, source=source)
    emit("student.created", student_id=str(student.pk))
    return student


@transaction.atomic
def update_student(*, actor, student, data):
    student = Student.objects.select_for_update().get(pk=student.pk)
    before = _snap(student)
    for f in STUDENT_FIELDS:
        if f in data:
            setattr(student, f, data[f])
    student.full_clean()
    student.save()
    b, a = audit.diff(before, _snap(student))
    if a:
        audit.record(AuditEvent.STUDENT_UPDATED, actor=actor, resource=student, before=b, after=a)
    return student


# ------------------------------------------------------------------ enrollment


def _validate_enrollment(student, classroom):
    if student.status != StudentStatus.ACTIVE:
        raise ConflictError(ErrorCode.INVALID_STATE_TRANSITION, f"Siswa berstatus {student.status}; tidak dapat didaftarkan ke rombel.")
    if not classroom.active:
        raise DomainError(ErrorCode.ENROLLMENT_CLASS_MISMATCH, "Rombel tidak aktif.")
    if classroom.academic_year.status == "CLOSED":
        raise DomainError(ErrorCode.ENROLLMENT_CLASS_MISMATCH, "Tahun ajaran rombel sudah ditutup.")
    if StudentEnrollment.objects.filter(student=student, academic_year=classroom.academic_year, status=EnrollmentStatus.ACTIVE).exists():
        raise ConflictError(ErrorCode.ENROLLMENT_DUPLICATE_ACTIVE, "Siswa sudah memiliki enrollment aktif di tahun ajaran ini.")


@transaction.atomic
def enroll(*, actor, student, classroom, start_date=None, source=EnrollmentSource.MANUAL):
    student = Student.objects.select_for_update().get(pk=student.pk)
    _validate_enrollment(student, classroom)
    if classroom.capacity and classroom.enrollments.filter(status=EnrollmentStatus.ACTIVE).count() >= classroom.capacity:
        raise ConflictError(ErrorCode.ENROLLMENT_CLASS_MISMATCH, f"Kapasitas rombel {classroom.name} ({classroom.capacity}) sudah penuh.")
    try:
        enr = StudentEnrollment.objects.create(
            student=student,
            academic_year=classroom.academic_year,
            grade_level=classroom.grade_level,
            major=classroom.major,
            classroom=classroom,
            start_date=start_date or timezone.localdate(),
            source=source,
        )
    except IntegrityError:
        raise ConflictError(ErrorCode.ENROLLMENT_DUPLICATE_ACTIVE, "Siswa sudah memiliki enrollment aktif di tahun ajaran ini.")
    audit.record(AuditEvent.ENROLLMENT_CREATED, actor=actor, resource=student, after=enrollment_detail(enr) | {"source": source})
    return enr


@transaction.atomic
def transfer_internal(*, actor, student, classroom, effective_date=None, reason=""):
    """Move within the same academic year (class or major). Previous enrollment is closed, never rewritten."""
    student = Student.objects.select_for_update().get(pk=student.pk)
    current = (
        StudentEnrollment.objects.select_for_update()
        .filter(student=student, academic_year=classroom.academic_year, status=EnrollmentStatus.ACTIVE)
        .select_related("classroom", "grade_level", "major", "academic_year")
        .first()
    )
    if current is None:
        raise DomainError(ErrorCode.ENROLLMENT_CLASS_MISMATCH, "Siswa belum memiliki enrollment aktif di tahun ajaran rombel tujuan.")
    if current.classroom_id == classroom.pk:
        raise DomainError(ErrorCode.VALIDATION_ERROR, "Data tidak valid.", fields={"classroom": ["Siswa sudah berada di rombel ini."]})
    if current.grade_level_id != classroom.grade_level_id:
        raise DomainError(ErrorCode.ENROLLMENT_CLASS_MISMATCH, "Pindah rombel hanya dalam tingkat yang sama; gunakan kenaikan kelas.")
    major_change = current.major_id != classroom.major_id
    if major_change:
        if not reason.strip():
            raise DomainError(ErrorCode.MAJOR_CHANGE_REASON_REQUIRED, "Perpindahan IPA/IPS wajib disertai alasan.")
        if not user_has_perm(actor, "student.change_status"):
            raise DomainError(ErrorCode.PERMISSION_DENIED, "Perpindahan jurusan membutuhkan izin student.change_status.", status_code=403)
    effective = effective_date or timezone.localdate()
    current.status = EnrollmentStatus.TRANSFERRED
    current.end_date = max(current.start_date, effective - timedelta(days=1))
    current.save(update_fields=["status", "end_date", "updated_at"])
    _validate_enrollment(student, classroom)
    new = StudentEnrollment.objects.create(
        student=student,
        academic_year=classroom.academic_year,
        grade_level=classroom.grade_level,
        major=classroom.major,
        classroom=classroom,
        start_date=effective,
        source=EnrollmentSource.TRANSFER,
    )
    t = StudentTransfer.objects.create(
        student=student,
        transfer_type=TransferType.INTERNAL_MAJOR if major_change else TransferType.INTERNAL_CLASS,
        effective_date=effective,
        from_detail=enrollment_detail(current),
        to_detail=enrollment_detail(new),
        reason=reason,
        approved_by=actor if getattr(actor, "is_authenticated", False) else None,
    )
    audit.record(
        AuditEvent.ENROLLMENT_CHANGED,
        actor=actor,
        resource=student,
        before=enrollment_detail(current),
        after=enrollment_detail(new),
        metadata={"reason": reason, "transfer_id": str(t.pk)},
    )
    audit.record(AuditEvent.STUDENT_TRANSFERRED, actor=actor, resource=student, metadata={"type": t.transfer_type})
    emit("student.transferred", student_id=str(student.pk))
    return new


# ------------------------------------------------------------------ status lifecycle

_ALLOWED = {
    StudentStatus.ACTIVE: {StudentStatus.TRANSFERRED, StudentStatus.LEFT, StudentStatus.INACTIVE, StudentStatus.GRADUATED},
    StudentStatus.INACTIVE: {StudentStatus.ACTIVE, StudentStatus.LEFT, StudentStatus.TRANSFERRED},
}
_ENROLLMENT_CLOSE = {
    StudentStatus.TRANSFERRED: EnrollmentStatus.TRANSFERRED,
    StudentStatus.LEFT: EnrollmentStatus.CANCELLED,
    StudentStatus.INACTIVE: EnrollmentStatus.CANCELLED,
    StudentStatus.GRADUATED: EnrollmentStatus.COMPLETED,
}


@transaction.atomic
def change_status(*, actor, student, to_status, effective_date=None, reason="", transfer=None):
    student = Student.objects.select_for_update().get(pk=student.pk)
    if to_status not in _ALLOWED.get(student.status, set()):
        raise ConflictError(ErrorCode.INVALID_STATE_TRANSITION, f"Status {student.status} tidak dapat menjadi {to_status}.")
    if to_status in {StudentStatus.TRANSFERRED, StudentStatus.LEFT} and not reason.strip():
        raise DomainError(ErrorCode.VALIDATION_ERROR, "Data tidak valid.", fields={"reason": ["Alasan wajib diisi."]})
    effective = effective_date or timezone.localdate()
    from_status = student.status
    student.status = to_status
    student.save(update_fields=["status", "updated_at"])
    if to_status in _ENROLLMENT_CLOSE:
        for enr in StudentEnrollment.objects.select_for_update().filter(student=student, status=EnrollmentStatus.ACTIVE):
            enr.status = _ENROLLMENT_CLOSE[to_status]
            enr.end_date = max(enr.start_date, effective)
            enr.save(update_fields=["status", "end_date", "updated_at"])
    StudentStatusHistory.objects.create(
        student=student,
        from_status=from_status,
        to_status=to_status,
        effective_date=effective,
        reason=reason,
        changed_by=actor if getattr(actor, "is_authenticated", False) else None,
    )
    if to_status == StudentStatus.TRANSFERRED:
        StudentTransfer.objects.create(
            student=student,
            transfer_type=TransferType.OUT,
            effective_date=effective,
            reason=reason,
            to_detail=(transfer or {}).get("destination") and {"destination": transfer["destination"]},
            document_file=(transfer or {}).get("document_file"),
            approved_by=actor if getattr(actor, "is_authenticated", False) else None,
        )
        audit.record(AuditEvent.STUDENT_TRANSFERRED, actor=actor, resource=student, metadata={"type": "OUT"})
    audit.record(
        AuditEvent.STUDENT_STATUS_CHANGED,
        actor=actor,
        resource=student,
        before={"status": from_status},
        after={"status": to_status},
        metadata={"reason": reason[:500], "effective_date": str(effective)},
    )
    emit("student.status_changed", student_id=str(student.pk), to_status=to_status)
    return student


# ------------------------------------------------------------------ guardians


@transaction.atomic
def link_guardian(
    *,
    actor,
    student,
    guardian=None,
    guardian_data=None,
    relationship,
    is_primary=False,
    receives_notifications=True,
    financial_contact=False,
):
    """Link an existing guardian (explicit id) or create a new one. Never merges by name (PRD §15.24)."""
    if guardian is None:
        guardian = Guardian(**(guardian_data or {}))
        guardian.full_clean()
        guardian.save()
    if StudentGuardian.objects.filter(student=student, guardian=guardian, active=True).exists():
        raise ConflictError(ErrorCode.VALIDATION_ERROR, "Wali sudah tertaut dengan siswa ini.")
    if is_primary:
        StudentGuardian.objects.filter(student=student, active=True, is_primary=True).update(is_primary=False)
    link = StudentGuardian.objects.create(
        student=student,
        guardian=guardian,
        relationship=relationship,
        is_primary=is_primary,
        receives_notifications=receives_notifications,
        financial_contact=financial_contact,
    )
    audit.record(
        AuditEvent.STUDENT_UPDATED,
        actor=actor,
        resource=student,
        after={"guardian_linked": str(guardian.pk), "relationship": relationship, "is_primary": is_primary},
    )
    return link


@transaction.atomic
def unlink_guardian(*, actor, link):
    link.active = False
    link.is_primary = False
    link.save(update_fields=["active", "is_primary", "updated_at"])
    audit.record(AuditEvent.STUDENT_UPDATED, actor=actor, resource=link.student, before={"guardian_linked": str(link.guardian_id)})


# ------------------------------------------------------------------ portal accounts


@transaction.atomic
def create_portal_account(*, actor, profile, username, password, role_code):
    from modules.accounts import services as accounts

    if profile.user_id:
        raise ConflictError(ErrorCode.VALIDATION_ERROR, "Profil ini sudah memiliki akun portal.")
    user = accounts.create_user(
        actor=actor, username=username, full_name=profile.full_name, email=profile.email or None, password=password, roles=[role_code]
    )
    profile.user = user
    profile.save(update_fields=["user", "updated_at"])
    return user


def student_card_qr_svg(student) -> str:
    """SVG QR for the digital student card; payload is the school-issued student number only."""
    from reportlab.graphics import renderSVG
    from reportlab.graphics.barcode.qr import QrCodeWidget
    from reportlab.graphics.shapes import Drawing

    widget = QrCodeWidget(f"NOSSEF:{student.student_no}", barLevel="M")
    x1, y1, x2, y2 = widget.getBounds()
    size = 160
    drawing = Drawing(size, size, transform=[size / (x2 - x1), 0, 0, size / (y2 - y1), -x1, -y1])
    drawing.add(widget)
    return renderSVG.drawToString(drawing)

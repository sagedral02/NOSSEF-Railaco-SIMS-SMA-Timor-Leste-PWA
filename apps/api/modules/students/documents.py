"""Student 360 documents tab (PRD §17.4, §31.2): every file attached to a student's records, in one list.

Each candidate is filtered through `documents.access.can_read`, so the tab never shows a file the viewer
could not download. Counseling/discipline evidence is restricted (INV-18) and deliberately left out.
"""

from modules.documents import access


def _item(category, file, title, date, ref=""):
    return file, {
        "category": category,
        "title": title,
        "reference": ref,
        "date": date,
        "file": {"id": file.pk, "original_name": file.original_name, "mime_type": file.mime_type, "size_bytes": file.size_bytes},
    }


def student_documents(user, student):
    from modules.admissions.models import ApplicantDocument
    from modules.attendance.models import StudentLeaveRequest
    from modules.finance.models import Payment, Receipt
    from modules.national_exams.models import NationalExamRecord
    from modules.report_cards.models import ReportCard

    items = []
    if student.photo_file_id:
        items.append(_item("STUDENT_PHOTO", student.photo_file, student.photo_file.original_name, student.photo_file.created_at))
    for d in ApplicantDocument.objects.filter(applicant__student=student, active=True).select_related("file", "applicant"):
        items.append(_item("ADMISSION", d.file, d.document_type, d.created_at, d.applicant.registration_no))
    for tr in student.transfers.filter(document_file__isnull=False).select_related("document_file"):
        items.append(_item("TRANSFER", tr.document_file, tr.transfer_type, tr.created_at))
    for lr in StudentLeaveRequest.objects.filter(student=student, supporting_file__isnull=False).select_related("supporting_file"):
        items.append(_item("LEAVE_EVIDENCE", lr.supporting_file, lr.leave_type, lr.created_at))
    reports = ReportCard.objects.filter(student=student, pdf_file__isnull=False).select_related("pdf_file", "trimester__academic_year")
    for rc in reports:
        items.append(
            _item(
                "REPORT_CARD",
                rc.pdf_file,
                f"{rc.trimester.academic_year.name} · {rc.trimester.name}",
                rc.created_at,
                f"Rev. {rc.revision_no}",
            )
        )
    for ne in NationalExamRecord.objects.filter(student=student, document_file__isnull=False).select_related("document_file"):
        items.append(_item("NATIONAL_EXAM", ne.document_file, ne.exam_name, ne.created_at, ne.certificate_no))
    for p in Payment.objects.filter(student=student, proof_file__isnull=False).select_related("proof_file"):
        items.append(_item("PAYMENT_PROOF", p.proof_file, p.proof_file.original_name, p.created_at, p.payment_no))
    for r in Receipt.objects.filter(payment__student=student, pdf_file__isnull=False).select_related("pdf_file"):
        items.append(_item("RECEIPT", r.pdf_file, r.receipt_no, r.issued_at, r.receipt_no))

    allowed = {}
    readable = []
    for file, it in items:
        if file.pk not in allowed:
            allowed[file.pk] = access.can_read(user, file)
        if allowed[file.pk]:
            readable.append(it)
    return sorted(readable, key=lambda x: x["date"], reverse=True)

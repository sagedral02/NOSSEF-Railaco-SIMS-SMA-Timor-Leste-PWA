"""Finance file access: proofs and receipts follow the payment's finance read scope."""

from django.db.models import Q

from modules.documents.access import register

from .models import Payment, Receipt


@register
def finance_files(user, file):
    payment = Payment.objects.filter(proof_file=file).first()
    if payment is None:
        receipt = Receipt.objects.filter(pdf_file=file).select_related("payment").first()
        payment = receipt.payment if receipt else None
    if payment is None:
        return None
    from .selectors import finance_students

    return finance_students(user).filter(Q(pk=payment.student_id)).exists()

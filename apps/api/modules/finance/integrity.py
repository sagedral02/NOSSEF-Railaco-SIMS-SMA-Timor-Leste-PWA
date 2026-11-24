"""Finance integrity checks (PRD §54 INT-017..INT-021)."""

from django.db.models import DecimalField, F, OuterRef, Q, Subquery, Sum, Value
from django.db.models.functions import Coalesce

from .models import Invoice, InvoiceItem, Payment, PaymentAllocation

ZERO = Value(0, output_field=DecimalField(max_digits=12, decimal_places=2))


def int_017_invoice_total_matches_items():
    items = InvoiceItem.objects.filter(invoice=OuterRef("pk")).values("invoice").annotate(s=Sum("line_total")).values("s")[:1]
    bad = Invoice.objects.annotate(items_total=Coalesce(Subquery(items), ZERO)).exclude(total=F("items_total")).count()
    return "INT-017", bad == 0, f"invoices whose total differs from item line totals: {bad}"


def int_018_paid_matches_allocations():
    alloc = (
        PaymentAllocation.objects.filter(invoice=OuterRef("pk"), payment__status="VERIFIED")
        .values("invoice")
        .annotate(s=Sum("amount"))
        .values("s")[:1]
    )
    bad = Invoice.objects.annotate(alloc=Coalesce(Subquery(alloc), ZERO)).exclude(paid_amount=F("alloc")).count()
    return "INT-018", bad == 0, f"invoices whose paid_amount differs from verified allocations: {bad}"


def int_019_no_negative_balance():
    bad = Invoice.objects.filter(Q(balance__lt=0) | Q(paid_amount__gt=F("total"))).count()
    return "INT-019", bad == 0, f"invoices with negative balance/overpayment: {bad}"


def int_020_allocations_within_payment():
    alloc = PaymentAllocation.objects.filter(payment=OuterRef("pk")).values("payment").annotate(s=Sum("amount")).values("s")[:1]
    bad = Payment.objects.annotate(alloc=Coalesce(Subquery(alloc), ZERO)).filter(alloc__gt=F("amount")).count()
    return "INT-020", bad == 0, f"payments over-allocated: {bad}"


def int_021_reversed_not_counted():
    bad = Payment.objects.filter(status="REVERSED", reversal__isnull=True).count()
    return "INT-021", bad == 0, f"reversed payments without a reversal record: {bad}"

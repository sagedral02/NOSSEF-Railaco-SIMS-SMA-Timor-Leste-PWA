"""Student billing (PRD §15.48–§15.58, §25). Not general accounting: USD, Decimal only, no hard delete of money records.

Payment status adds REJECTED (PRD §66: PENDING → VERIFIED/REJECTED; VERIFIED → REVERSED) and `rejection_reason`;
bank-transfer submissions keep the payer's intended invoices in `intended_invoices` until Finance verifies.
"""

from decimal import Decimal

from django.conf import settings
from django.db import models
from django.db.models import F, Q

from common.models import BaseModel

ZERO = Decimal("0.00")


def money(**kw):
    return models.DecimalField(max_digits=12, decimal_places=2, **kw)


class FeeType(BaseModel):
    class Recurrence(models.TextChoices):
        MONTHLY = "MONTHLY", "Monthly"
        ONE_TIME = "ONE_TIME", "One time"
        TRIMESTER = "TRIMESTER", "Trimester"
        YEARLY = "YEARLY", "Yearly"
        MANUAL = "MANUAL", "Manual"

    code = models.CharField(max_length=30, unique=True)
    name = models.CharField(max_length=100)
    recurrence = models.CharField(max_length=10, choices=Recurrence.choices)
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ("code",)
        indexes = [models.Index(fields=["active"]), models.Index(fields=["recurrence"])]

    def __str__(self):
        return self.code


class FeePlan(BaseModel):
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        ACTIVE = "ACTIVE", "Active"
        INACTIVE = "INACTIVE", "Inactive"

    academic_year = models.ForeignKey("academics.AcademicYear", on_delete=models.PROTECT, related_name="fee_plans")
    fee_type = models.ForeignKey(FeeType, on_delete=models.PROTECT, related_name="plans")
    grade_level = models.ForeignKey("academics.GradeLevel", null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    major = models.ForeignKey("academics.Major", null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    amount = money()
    due_day = models.PositiveSmallIntegerField(null=True, blank=True)
    status = models.CharField(max_length=8, choices=Status.choices, default=Status.DRAFT)

    class Meta:
        ordering = ("fee_type__code", "grade_level__sequence")
        indexes = [models.Index(fields=["academic_year", "fee_type", "status"])]
        constraints = [
            models.CheckConstraint(condition=Q(amount__gte=0), name="finance_plan_amount_nonneg"),
            models.CheckConstraint(
                condition=Q(due_day__isnull=True) | Q(due_day__gte=1, due_day__lte=28), name="finance_plan_due_day_range"
            ),
            models.UniqueConstraint(
                fields=["academic_year", "fee_type", "grade_level", "major"],
                condition=Q(status="ACTIVE"),
                nulls_distinct=False,
                name="finance_plan_unique_active",
            ),
        ]

    def __str__(self):
        return f"{self.fee_type_id} {self.amount}"


class StudentFeeAssignment(BaseModel):
    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Active"
        INACTIVE = "INACTIVE", "Inactive"

    student = models.ForeignKey("students.Student", on_delete=models.PROTECT, related_name="fee_assignments")
    fee_plan = models.ForeignKey(FeePlan, on_delete=models.PROTECT, related_name="assignments")
    effective_from = models.DateField()
    effective_until = models.DateField(null=True, blank=True)
    amount_override = money(null=True, blank=True)
    status = models.CharField(max_length=8, choices=Status.choices, default=Status.ACTIVE)

    class Meta:
        indexes = [models.Index(fields=["student", "status"])]
        constraints = [
            models.CheckConstraint(
                condition=Q(effective_until__isnull=True) | Q(effective_until__gte=F("effective_from")), name="finance_assignment_range"
            ),
            models.CheckConstraint(
                condition=Q(amount_override__isnull=True) | Q(amount_override__gte=0), name="finance_assignment_override_nonneg"
            ),
        ]


class Discount(BaseModel):
    class Type(models.TextChoices):
        FIXED = "FIXED", "Fixed"
        PERCENT = "PERCENT", "Percent"

    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Active"
        EXPIRED = "EXPIRED", "Expired"
        REVOKED = "REVOKED", "Revoked"

    student = models.ForeignKey("students.Student", on_delete=models.PROTECT, related_name="discounts")
    academic_year = models.ForeignKey("academics.AcademicYear", on_delete=models.PROTECT, related_name="+")
    fee_type = models.ForeignKey(FeeType, null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    discount_type = models.CharField(max_length=8, choices=Type.choices)
    value = money()
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    reason = models.TextField()
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    status = models.CharField(max_length=8, choices=Status.choices, default=Status.ACTIVE)

    class Meta:
        indexes = [models.Index(fields=["student", "status"])]
        constraints = [
            models.CheckConstraint(condition=Q(value__gte=0), name="finance_discount_nonneg"),
            models.CheckConstraint(condition=~Q(discount_type="PERCENT") | Q(value__lte=100), name="finance_discount_percent_le_100"),
            models.CheckConstraint(condition=Q(end_date__isnull=True) | Q(end_date__gte=F("start_date")), name="finance_discount_range"),
        ]


class Scholarship(BaseModel):
    class Coverage(models.TextChoices):
        FULL = "FULL", "Full"
        PERCENT = "PERCENT", "Percent"
        FIXED = "FIXED", "Fixed"

    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Active"
        ENDED = "ENDED", "Ended"
        REVOKED = "REVOKED", "Revoked"

    student = models.ForeignKey("students.Student", on_delete=models.PROTECT, related_name="scholarships")
    name = models.CharField(max_length=150)
    coverage_type = models.CharField(max_length=8, choices=Coverage.choices)
    value = money(null=True, blank=True)
    valid_from = models.DateField()
    valid_until = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=8, choices=Status.choices, default=Status.ACTIVE)
    note = models.TextField(blank=True, default="")

    class Meta:
        indexes = [models.Index(fields=["student", "status"])]
        constraints = [
            models.CheckConstraint(
                condition=Q(coverage_type="FULL") | (Q(value__isnull=False) & Q(value__gte=0)), name="finance_scholarship_value_required"
            ),
            models.CheckConstraint(condition=~Q(coverage_type="PERCENT") | Q(value__lte=100), name="finance_scholarship_percent_le_100"),
            models.CheckConstraint(
                condition=Q(valid_until__isnull=True) | Q(valid_until__gte=F("valid_from")), name="finance_scholarship_range"
            ),
        ]


class Invoice(BaseModel):
    class Status(models.TextChoices):
        UNPAID = "UNPAID", "Unpaid"
        PARTIALLY_PAID = "PARTIALLY_PAID", "Partially paid"
        PAID = "PAID", "Paid"
        VOID = "VOID", "Void"

    invoice_no = models.CharField(max_length=50, unique=True)
    student = models.ForeignKey("students.Student", on_delete=models.PROTECT, related_name="invoices")
    academic_year = models.ForeignKey("academics.AcademicYear", on_delete=models.PROTECT, related_name="+")
    trimester = models.ForeignKey("academics.Trimester", null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    billing_period = models.CharField(max_length=7, blank=True, default="")  # YYYY-MM for SPP
    issue_date = models.DateField()
    due_date = models.DateField()
    subtotal = money(default=ZERO)
    discount_total = money(default=ZERO)
    total = money(default=ZERO)
    paid_amount = money(default=ZERO)
    balance = money(default=ZERO)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.UNPAID)
    generation_key = models.CharField(max_length=180, null=True, blank=True, unique=True)
    void_reason = models.TextField(blank=True, default="")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+")

    class Meta:
        ordering = ("-issue_date", "invoice_no")
        indexes = [
            models.Index(fields=["student", "status"]),
            models.Index(fields=["due_date", "status"]),
            models.Index(fields=["billing_period"]),
        ]
        constraints = [
            models.CheckConstraint(condition=Q(total__gte=0) & Q(balance__gte=0) & Q(paid_amount__gte=0), name="finance_invoice_nonneg"),
            models.CheckConstraint(condition=Q(paid_amount__lte=F("total")), name="finance_invoice_not_overpaid"),
        ]

    def __str__(self):
        return self.invoice_no


class InvoiceItem(BaseModel):
    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name="items")
    fee_type = models.ForeignKey(FeeType, on_delete=models.PROTECT, related_name="+")
    description = models.CharField(max_length=200)
    quantity = models.DecimalField(max_digits=8, decimal_places=2, default=Decimal("1"))
    unit_amount = money()
    discount_amount = money(default=ZERO)
    line_total = money()

    class Meta:
        indexes = [models.Index(fields=["invoice"]), models.Index(fields=["fee_type"])]
        constraints = [models.CheckConstraint(condition=Q(line_total__gte=0), name="finance_item_total_nonneg")]


class Payment(BaseModel):
    class Method(models.TextChoices):
        CASH = "CASH", "Cash"
        BANK_TRANSFER = "BANK_TRANSFER", "Bank transfer"
        OTHER = "OTHER", "Other"

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        VERIFIED = "VERIFIED", "Verified"
        REJECTED = "REJECTED", "Rejected"
        REVERSED = "REVERSED", "Reversed"

    payment_no = models.CharField(max_length=50, unique=True)
    student = models.ForeignKey("students.Student", on_delete=models.PROTECT, related_name="payments")
    payment_date = models.DateTimeField()
    amount = money()
    method = models.CharField(max_length=14, choices=Method.choices)
    reference_no = models.CharField(max_length=100, blank=True, default="")
    status = models.CharField(max_length=8, choices=Status.choices, default=Status.PENDING)
    proof_file = models.ForeignKey("documents.StoredFile", null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    received_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    submitted_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    verified_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    verified_at = models.DateTimeField(null=True, blank=True)
    idempotency_key = models.CharField(max_length=100, null=True, blank=True, unique=True)
    intended_invoices = models.JSONField(default=list, blank=True)
    note = models.TextField(blank=True, default="")
    rejection_reason = models.TextField(blank=True, default="")

    class Meta:
        ordering = ("-payment_date",)
        indexes = [
            models.Index(fields=["student", "status"]),
            models.Index(fields=["payment_date"]),
            models.Index(fields=["status", "method"]),
        ]
        constraints = [models.CheckConstraint(condition=Q(amount__gt=0), name="finance_payment_amount_positive")]

    def __str__(self):
        return self.payment_no


class PaymentAllocation(BaseModel):
    payment = models.ForeignKey(Payment, on_delete=models.PROTECT, related_name="allocations")
    invoice = models.ForeignKey(Invoice, on_delete=models.PROTECT, related_name="allocations")
    amount = money()

    class Meta:
        indexes = [models.Index(fields=["payment"]), models.Index(fields=["invoice"])]
        constraints = [
            models.UniqueConstraint(fields=["payment", "invoice"], name="finance_allocation_unique"),
            models.CheckConstraint(condition=Q(amount__gt=0), name="finance_allocation_positive"),
        ]


class PaymentReversal(BaseModel):
    payment = models.OneToOneField(Payment, on_delete=models.PROTECT, related_name="reversal")
    reason = models.TextField()
    reversed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    reversed_at = models.DateTimeField()
    approval_note = models.TextField(blank=True, default="")

    class Meta:
        indexes = [models.Index(fields=["reversed_at"])]


class Receipt(BaseModel):
    receipt_no = models.CharField(max_length=50, unique=True)
    payment = models.ForeignKey(Payment, on_delete=models.PROTECT, related_name="receipts")
    issued_at = models.DateTimeField()
    issued_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    pdf_file = models.ForeignKey("documents.StoredFile", null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    snapshot = models.JSONField()

    class Meta:
        ordering = ("-issued_at",)
        indexes = [models.Index(fields=["payment"])]

    def __str__(self):
        return self.receipt_no

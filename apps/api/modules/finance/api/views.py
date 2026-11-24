"""Finance endpoints (PRD §25.9, §47 Finance rows). Teachers have no finance access; portal users read their own/linked
children only and may submit bank-transfer proofs (PENDING until Finance verifies)."""

import csv
import io
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.db.models import Count, Q, Sum
from django.db.models.functions import TruncDate
from django.http import FileResponse, HttpResponse
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, OpenApiTypes, extend_schema, extend_schema_view
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from common.api.crud import MasterDataViewSet, ModelCleanSerializer
from common.api.exceptions import ConflictError, DomainError, ErrorCode, ScopeDenied
from common.permissions import ActionPermission, user_has_perm
from modules.academics.models import AcademicYear
from modules.audit import services as audit
from modules.audit.events import AuditEvent
from modules.documents import services as files
from modules.documents.models import StoredFile
from modules.students.models import EnrollmentStatus, Student, StudentEnrollment

from .. import services
from ..models import (
    Discount,
    FeePlan,
    FeeType,
    Invoice,
    InvoiceItem,
    Payment,
    PaymentAllocation,
    Receipt,
    Scholarship,
    StudentFeeAssignment,
)
from ..selectors import finance_students

# ---------------------------------------------------------------- masters


class FeeTypeSerializer(ModelCleanSerializer):
    class Meta:
        model = FeeType
        fields = ("id", "code", "name", "recurrence", "active")


class FeePlanSerializer(ModelCleanSerializer):
    fee_type_code = serializers.CharField(source="fee_type.code", read_only=True)
    grade_level_code = serializers.CharField(source="grade_level.code", read_only=True, default=None)
    major_code = serializers.CharField(source="major.code", read_only=True, default=None)

    class Meta:
        model = FeePlan
        fields = (
            "id",
            "academic_year",
            "fee_type",
            "fee_type_code",
            "grade_level",
            "grade_level_code",
            "major",
            "major_code",
            "amount",
            "due_day",
            "status",
        )


class AssignmentSerializer(ModelCleanSerializer):
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    student_no = serializers.CharField(source="student.student_no", read_only=True)
    fee_type_code = serializers.CharField(source="fee_plan.fee_type.code", read_only=True)

    class Meta:
        model = StudentFeeAssignment
        fields = (
            "id",
            "student",
            "student_name",
            "student_no",
            "fee_plan",
            "fee_type_code",
            "effective_from",
            "effective_until",
            "amount_override",
            "status",
        )


class DiscountSerializer(ModelCleanSerializer):
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    student_no = serializers.CharField(source="student.student_no", read_only=True)
    fee_type_code = serializers.CharField(source="fee_type.code", read_only=True, default=None)
    approved_by_name = serializers.CharField(source="approved_by.username", read_only=True)

    class Meta:
        model = Discount
        fields = (
            "id",
            "student",
            "student_name",
            "student_no",
            "academic_year",
            "fee_type",
            "fee_type_code",
            "discount_type",
            "value",
            "start_date",
            "end_date",
            "reason",
            "status",
            "approved_by_name",
        )

    def validate(self, attrs):
        if self.instance is None:
            attrs["approved_by"] = self.context["request"].user
        return super().validate(attrs)


class ScholarshipSerializer(ModelCleanSerializer):
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    student_no = serializers.CharField(source="student.student_no", read_only=True)

    class Meta:
        model = Scholarship
        fields = (
            "id",
            "student",
            "student_name",
            "student_no",
            "name",
            "coverage_type",
            "value",
            "valid_from",
            "valid_until",
            "status",
            "note",
        )


def _filter(qs, params, mapping):
    for param, f in mapping:
        if v := params.get(param):
            qs = qs.filter(**{f: v})
    return qs


@extend_schema(tags=["finance"])
class FeeTypeViewSet(MasterDataViewSet):
    serializer_class = FeeTypeSerializer
    queryset = FeeType.objects.all()
    view_permission = "finance.view"
    manage_permission = "finance.manage_fee"
    pagination_class = None
    filter_backends = []


@extend_schema_view(list=extend_schema(parameters=[OpenApiParameter(p, str) for p in ("academic_year_id", "fee_type_id", "status")]))
@extend_schema(tags=["finance"])
class FeePlanViewSet(MasterDataViewSet):
    serializer_class = FeePlanSerializer
    view_permission = "finance.view"
    manage_permission = "finance.manage_fee"
    pagination_class = None
    filter_backends = []
    queryset = FeePlan.objects.none()

    def get_queryset(self):
        qs = FeePlan.objects.select_related("fee_type", "grade_level", "major")
        return _filter(
            qs, self.request.query_params, (("academic_year_id", "academic_year_id"), ("fee_type_id", "fee_type_id"), ("status", "status"))
        )


class _StudentScopedMaster(MasterDataViewSet):
    view_permission = "finance.view"
    manage_permission = "finance.manage_fee"
    filter_backends = []
    model = None

    def get_queryset(self):
        qs = self.model.objects.select_related("student")
        return _filter(
            qs, self.request.query_params, (("student_id", "student_id"), ("status", "status"), ("academic_year_id", "academic_year_id"))
        )


@extend_schema(tags=["finance"])
class AssignmentViewSet(_StudentScopedMaster):
    serializer_class = AssignmentSerializer
    model = StudentFeeAssignment
    queryset = StudentFeeAssignment.objects.none()

    def get_queryset(self):
        return _filter(
            StudentFeeAssignment.objects.select_related("student", "fee_plan__fee_type"),
            self.request.query_params,
            (("student_id", "student_id"), ("status", "status")),
        )


@extend_schema(tags=["finance"])
class DiscountViewSet(_StudentScopedMaster):
    serializer_class = DiscountSerializer
    model = Discount
    queryset = Discount.objects.none()

    def perform_create(self, serializer):
        super().perform_create(serializer)
        audit.record(
            AuditEvent.DISCOUNT_CHANGED,
            actor=self.request.user,
            resource=serializer.instance,
            metadata={"reason": serializer.instance.reason[:300]},
        )


@extend_schema(tags=["finance"])
class ScholarshipViewSet(_StudentScopedMaster):
    serializer_class = ScholarshipSerializer
    model = Scholarship
    queryset = Scholarship.objects.none()

    def get_queryset(self):
        return _filter(
            Scholarship.objects.select_related("student"), self.request.query_params, (("student_id", "student_id"), ("status", "status"))
        )


# ---------------------------------------------------------------- invoices


class InvoiceItemSerializer(serializers.ModelSerializer):
    fee_type_code = serializers.CharField(source="fee_type.code", read_only=True)

    class Meta:
        model = InvoiceItem
        fields = ("id", "fee_type", "fee_type_code", "description", "quantity", "unit_amount", "discount_amount", "line_total")


class AllocationSerializer(serializers.ModelSerializer):
    payment_no = serializers.CharField(source="payment.payment_no", read_only=True)
    payment_status = serializers.CharField(source="payment.status", read_only=True)
    invoice_no = serializers.CharField(source="invoice.invoice_no", read_only=True)
    method = serializers.CharField(source="payment.method", read_only=True)
    date = serializers.DateTimeField(source="payment.payment_date", read_only=True)

    class Meta:
        model = PaymentAllocation
        fields = ("id", "payment", "payment_no", "payment_status", "method", "date", "invoice", "invoice_no", "amount")


class InvoiceSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    student_no = serializers.CharField(source="student.student_no", read_only=True)
    overdue = serializers.SerializerMethodField()

    class Meta:
        model = Invoice
        fields = (
            "id",
            "invoice_no",
            "student",
            "student_name",
            "student_no",
            "academic_year",
            "trimester",
            "billing_period",
            "issue_date",
            "due_date",
            "subtotal",
            "discount_total",
            "total",
            "paid_amount",
            "balance",
            "status",
            "void_reason",
            "overdue",
        )

    def get_overdue(self, obj) -> bool:
        return obj.status in {"UNPAID", "PARTIALLY_PAID"} and obj.due_date < timezone.localdate()


class InvoiceDetailSerializer(InvoiceSerializer):
    items = InvoiceItemSerializer(many=True, read_only=True)
    allocations = AllocationSerializer(many=True, read_only=True)

    class Meta(InvoiceSerializer.Meta):
        fields = (*InvoiceSerializer.Meta.fields, "items", "allocations")


class GenerateSerializer(serializers.Serializer):
    academic_year = serializers.PrimaryKeyRelatedField(queryset=AcademicYear.objects.all())
    period = serializers.RegexField(r"^\d{4}-\d{2}$")
    fee_type = serializers.CharField(default="SPP")


class ManualItemSerializer(serializers.Serializer):
    description = serializers.CharField(max_length=200)
    quantity = serializers.DecimalField(max_digits=8, decimal_places=2, default=1)
    unit_amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    discount_amount = serializers.DecimalField(max_digits=12, decimal_places=2, default=0)


class ManualInvoiceSerializer(serializers.Serializer):
    student = serializers.PrimaryKeyRelatedField(queryset=Student.objects.all())
    academic_year = serializers.PrimaryKeyRelatedField(queryset=AcademicYear.objects.all())
    fee_type = serializers.PrimaryKeyRelatedField(queryset=FeeType.objects.filter(active=True))
    due_date = serializers.DateField()
    items = ManualItemSerializer(many=True)


class ReasonSerializer(serializers.Serializer):
    reason = serializers.CharField()


INVOICE_PARAMS = ("student_id", "status", "billing_period", "academic_year_id", "classroom_id", "overdue", "q")


@extend_schema_view(list=extend_schema(parameters=[OpenApiParameter(p, str) for p in INVOICE_PARAMS]))
@extend_schema(tags=["finance"])
class InvoiceViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    serializer_class = InvoiceSerializer
    queryset = Invoice.objects.none()
    permission_classes = [ActionPermission]
    required_permissions = {
        "list": None,
        "retrieve": None,
        "create": "finance.generate_invoice",
        "generate_preview": "finance.generate_invoice",
        "generate": "finance.generate_invoice",
        "void": "finance.generate_invoice",
    }
    filter_backends = []

    def get_serializer_class(self):
        return InvoiceDetailSerializer if self.action == "retrieve" else InvoiceSerializer

    def get_queryset(self):
        qs = Invoice.objects.filter(student__in=finance_students(self.request.user)).select_related("student")
        if self.action == "retrieve":
            qs = qs.prefetch_related("items__fee_type", "allocations__payment", "allocations__invoice")
        p = self.request.query_params
        qs = _filter(
            qs,
            p,
            (
                ("student_id", "student_id"),
                ("status", "status"),
                ("billing_period", "billing_period"),
                ("academic_year_id", "academic_year_id"),
            ),
        )
        if v := p.get("classroom_id"):
            qs = qs.filter(student__enrollments__classroom_id=v, student__enrollments__status=EnrollmentStatus.ACTIVE)
        if p.get("overdue") in {"1", "true"}:
            qs = qs.filter(status__in=["UNPAID", "PARTIALLY_PAID"], due_date__lt=timezone.localdate())
        if v := p.get("open"):
            if v in {"1", "true"}:
                qs = qs.filter(status__in=["UNPAID", "PARTIALLY_PAID"])
        if q := p.get("q", "").strip():
            qs = qs.filter(Q(invoice_no__icontains=q) | Q(student__full_name__icontains=q) | Q(student__student_no__icontains=q))
        return qs.order_by("-issue_date", "-invoice_no")

    def get_object(self):
        obj = self.get_queryset().filter(pk=self.kwargs["pk"]).first()
        if obj is None:
            raise ScopeDenied()
        return obj

    @extend_schema(request=ManualInvoiceSerializer, responses={201: InvoiceDetailSerializer})
    def create(self, request):
        data = ManualInvoiceSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        inv = services.create_manual_invoice(
            actor=request.user,
            student=v["student"],
            year=v["academic_year"],
            fee_type=v["fee_type"],
            items=v["items"],
            due_date=v["due_date"],
        )
        return Response(InvoiceDetailSerializer(inv).data, status=status.HTTP_201_CREATED)

    @extend_schema(request=GenerateSerializer, responses={200: dict})
    @action(detail=False, methods=["post"], url_path="generate-preview")
    def generate_preview(self, request):
        data = GenerateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        return Response(services.generation_preview(year=v["academic_year"], period=v["period"], fee_code=v["fee_type"]))

    @extend_schema(request=GenerateSerializer, responses={200: dict})
    @action(detail=False, methods=["post"])
    def generate(self, request):
        data = GenerateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        from ..tasks import generate_invoices_task

        result = generate_invoices_task.delay(str(v["academic_year"].pk), v["period"], v["fee_type"], str(request.user.pk))
        if getattr(settings, "CELERY_TASK_ALWAYS_EAGER", False):  # local mode returns counts immediately
            return Response(result.get())
        return Response({"queued": True, "task_id": result.id}, status=status.HTTP_202_ACCEPTED)

    @extend_schema(request=ReasonSerializer, responses={200: InvoiceSerializer})
    @action(detail=True, methods=["post"])
    def void(self, request, pk=None):
        data = ReasonSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        return Response(
            InvoiceSerializer(
                services.void_invoice(actor=request.user, invoice=self.get_object(), reason=data.validated_data["reason"])
            ).data
        )


# ---------------------------------------------------------------- payments


class PaymentSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    student_no = serializers.CharField(source="student.student_no", read_only=True)
    received_by_name = serializers.CharField(source="received_by.username", read_only=True, default=None)
    verified_by_name = serializers.CharField(source="verified_by.username", read_only=True, default=None)
    allocations = AllocationSerializer(many=True, read_only=True)
    receipt = serializers.SerializerMethodField()
    reversal_reason = serializers.SerializerMethodField()

    class Meta:
        model = Payment
        fields = (
            "id",
            "payment_no",
            "student",
            "student_name",
            "student_no",
            "payment_date",
            "amount",
            "method",
            "reference_no",
            "status",
            "proof_file",
            "received_by_name",
            "verified_by_name",
            "verified_at",
            "intended_invoices",
            "note",
            "rejection_reason",
            "reversal_reason",
            "allocations",
            "receipt",
        )

    def get_receipt(self, obj) -> dict | None:
        r = obj.receipts.order_by("-issued_at").first()
        return {"id": str(r.pk), "receipt_no": r.receipt_no, "pdf_file": str(r.pdf_file_id) if r.pdf_file_id else None} if r else None

    def get_reversal_reason(self, obj) -> str | None:
        rev = getattr(obj, "reversal", None) if obj.status == "REVERSED" else None
        return rev.reason if rev else None


class AllocationInput(serializers.Serializer):
    invoice = serializers.UUIDField()
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)


class PaymentCreateSerializer(serializers.Serializer):
    student = serializers.UUIDField()
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    method = serializers.ChoiceField(choices=Payment.Method.choices)
    reference_no = serializers.CharField(required=False, allow_blank=True, default="")
    note = serializers.CharField(required=False, allow_blank=True, default="")
    allocations = AllocationInput(many=True, required=False)
    proof_file = serializers.PrimaryKeyRelatedField(queryset=StoredFile.objects.all(), required=False, allow_null=True)
    invoice_ids = serializers.ListField(child=serializers.UUIDField(), required=False)


class VerifySerializer(serializers.Serializer):
    allocations = AllocationInput(many=True, required=False)


class ReverseSerializer(ReasonSerializer):
    approval_note = serializers.CharField(required=False, allow_blank=True, default="")


@extend_schema_view(
    list=extend_schema(parameters=[OpenApiParameter(p, str) for p in ("student_id", "status", "method", "date_from", "date_to", "q")])
)
@extend_schema(tags=["finance"])
class PaymentViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    serializer_class = PaymentSerializer
    queryset = Payment.objects.none()
    permission_classes = [ActionPermission]
    required_permissions = {
        "list": None,
        "retrieve": None,
        "create": None,  # method-specific check below (portal may submit transfers)
        "suggest": "finance.verify_payment",
        "verify": "finance.verify_payment",
        "reject": "finance.verify_payment",
        "reverse": "finance.reverse_payment",
    }
    filter_backends = []

    def get_queryset(self):
        qs = (
            Payment.objects.filter(student__in=finance_students(self.request.user))
            .select_related("student", "received_by", "verified_by", "reversal")
            .prefetch_related("allocations__invoice", "allocations__payment", "receipts")
        )
        p = self.request.query_params
        qs = _filter(qs, p, (("student_id", "student_id"), ("status", "status"), ("method", "method")))
        if v := p.get("date_from"):
            qs = qs.filter(payment_date__date__gte=v)
        if v := p.get("date_to"):
            qs = qs.filter(payment_date__date__lte=v)
        if q := p.get("q", "").strip():
            qs = qs.filter(
                Q(payment_no__icontains=q)
                | Q(student__full_name__icontains=q)
                | Q(student__student_no__icontains=q)
                | Q(reference_no__icontains=q)
            )
        return qs

    def get_object(self):
        obj = self.get_queryset().filter(pk=self.kwargs["pk"]).first()
        if obj is None:
            raise ScopeDenied()
        return obj

    @extend_schema(request=PaymentCreateSerializer, responses={201: PaymentSerializer})
    def create(self, request):
        data = PaymentCreateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        student = finance_students(request.user).filter(pk=v["student"]).first()
        if student is None:
            raise ScopeDenied()
        key = request.headers.get("Idempotency-Key")
        if v["method"] == "BANK_TRANSFER" and not v.get("allocations"):
            payment, created = services.submit_transfer(
                actor=request.user,
                student=student,
                amount=v["amount"],
                reference_no=v["reference_no"],
                proof_file=v.get("proof_file"),
                invoice_ids=v.get("invoice_ids"),
                note=v["note"],
                idempotency_key=key,
            )
        else:
            if not user_has_perm(request.user, "finance.receive_payment"):
                raise DomainError(ErrorCode.PERMISSION_DENIED, "Hanya bendahara yang dapat mencatat pembayaran tunai.", status_code=403)
            payment, created = services.record_cash_payment(
                actor=request.user,
                student=student,
                amount=v["amount"],
                allocations=v.get("allocations") or [],
                method=v["method"],
                reference_no=v["reference_no"],
                note=v["note"],
                idempotency_key=key,
            )
        payment = self.get_queryset().get(pk=payment.pk)
        return Response(PaymentSerializer(payment).data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    @extend_schema(responses={200: dict})
    @action(detail=True, methods=["get"])
    def suggest(self, request, pk=None):
        allocations, unallocated = services.suggest_allocations(self.get_object())
        return Response({"allocations": allocations, "unallocated": unallocated})

    @extend_schema(request=VerifySerializer, responses={200: PaymentSerializer})
    @action(detail=True, methods=["post"])
    def verify(self, request, pk=None):
        data = VerifySerializer(data=request.data)
        data.is_valid(raise_exception=True)
        payment = self.get_object()
        allocations = data.validated_data.get("allocations")
        if not allocations:
            allocations, _ = services.suggest_allocations(payment)
        services.verify_payment(actor=request.user, payment=payment, allocations=allocations)
        return Response(PaymentSerializer(self.get_queryset().get(pk=payment.pk)).data)

    @extend_schema(request=ReasonSerializer, responses={200: PaymentSerializer})
    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        data = ReasonSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        payment = services.reject_payment(actor=request.user, payment=self.get_object(), reason=data.validated_data["reason"])
        return Response(PaymentSerializer(self.get_queryset().get(pk=payment.pk)).data)

    @extend_schema(request=ReverseSerializer, responses={200: PaymentSerializer})
    @action(detail=True, methods=["post"])
    def reverse(self, request, pk=None):
        data = ReverseSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        payment = services.reverse_payment(actor=request.user, payment=self.get_object(), **data.validated_data)
        return Response(PaymentSerializer(self.get_queryset().get(pk=payment.pk)).data)


class ReceiptSerializer(serializers.ModelSerializer):
    class Meta:
        model = Receipt
        fields = ("id", "receipt_no", "payment", "issued_at", "pdf_file", "snapshot")


@extend_schema(tags=["finance"])
class ReceiptViewSet(mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    serializer_class = ReceiptSerializer
    queryset = Receipt.objects.none()
    permission_classes = [ActionPermission]
    required_permissions = {"retrieve": None, "download": None}

    def get_object(self):
        r = (
            Receipt.objects.filter(pk=self.kwargs["pk"], payment__student__in=finance_students(self.request.user))
            .select_related("payment")
            .first()
        )
        if r is None:
            raise ScopeDenied()
        return r

    @extend_schema(responses={(200, "application/pdf"): OpenApiTypes.BINARY})
    @action(detail=True, methods=["get"])
    def download(self, request, pk=None):
        r = self.get_object()
        if r.pdf_file_id is None:
            from ..tasks import render_receipt_pdf

            render_receipt_pdf(str(r.pk))
            r.refresh_from_db()
        if r.pdf_file_id is None:
            raise ConflictError(ErrorCode.JOB_ALREADY_RUNNING, "PDF kuitansi sedang dibuat.")
        resp = FileResponse(
            files.open_file(r.pdf_file),
            content_type="application/pdf",
            as_attachment=request.query_params.get("inline") != "1",
            filename=r.pdf_file.original_name,
        )
        resp["Cache-Control"] = "private, no-store"
        return resp


# ---------------------------------------------------------------- statement / portal / reports


class StatementView(APIView):
    @extend_schema(tags=["finance"], responses={200: dict})
    def get(self, request, student_id):
        student = finance_students(request.user).filter(pk=student_id).first()
        if student is None:
            raise ScopeDenied()
        return Response(services.statement(student))


class MyFinanceView(APIView):
    """Portal summary: linked children (or self) with outstanding/overdue balances."""

    @extend_schema(tags=["finance"], responses={200: dict})
    def get(self, request):
        today = timezone.localdate()
        rows = []
        for s in finance_students(request.user).filter(status="ACTIVE").order_by("full_name")[:20]:
            open_qs = Invoice.objects.filter(student=s, status__in=["UNPAID", "PARTIALLY_PAID"])
            rows.append(
                {
                    "student_id": str(s.pk),
                    "student_no": s.student_no,
                    "full_name": s.full_name,
                    "outstanding": str(open_qs.aggregate(b=Sum("balance"))["b"] or "0.00"),
                    "overdue": str(open_qs.filter(due_date__lt=today).aggregate(b=Sum("balance"))["b"] or "0.00"),
                    "open_invoices": open_qs.count(),
                    "pending_payments": Payment.objects.filter(student=s, status="PENDING").count(),
                }
            )
        return Response(rows)


def _class_of():
    return {
        e.student_id: e.classroom.name
        for e in StudentEnrollment.objects.filter(status=EnrollmentStatus.ACTIVE)
        .select_related("classroom")
        .order_by("academic_year__start_date")
    }


class FinanceSummaryView(APIView):
    """Dashboard + reports (PRD §25.8): collection by period, payments by method, cashier today, pending verifications."""

    @extend_schema(tags=["finance"], parameters=[OpenApiParameter("academic_year_id", str)], responses={200: dict})
    def get(self, request):
        if not user_has_perm(request.user, "finance.view"):
            raise DomainError(ErrorCode.PERMISSION_DENIED, "Anda tidak memiliki izin untuk tindakan ini.", status_code=403)
        year = (
            AcademicYear.objects.filter(pk=request.query_params.get("academic_year_id")).first()
            or AcademicYear.objects.filter(is_current=True).first()
        )
        inv = Invoice.objects.filter(academic_year=year).exclude(status="VOID")
        today = timezone.localdate()
        periods = list(
            inv.exclude(billing_period="")
            .values("billing_period")
            .annotate(
                total=Sum("total"),
                paid=Sum("paid_amount"),
                balance=Sum("balance"),
                invoices=Count("id"),
                paid_count=Count("id", filter=Q(status="PAID")),
            )
            .order_by("billing_period")
        )
        verified = Payment.objects.filter(status="VERIFIED")
        by_method = list(
            verified.filter(payment_date__date__gte=year.start_date if year else today)
            .values("method")
            .annotate(total=Sum("amount"), count=Count("id"))
            .order_by("method")
        )
        daily = list(
            verified.filter(payment_date__date__gte=today - timedelta(days=13))
            .annotate(day=TruncDate("payment_date"))
            .values("day")
            .annotate(total=Sum("amount"), count=Count("id"))
            .order_by("day")
        )
        cashier = (
            verified.filter(verified_at__date=today)
            .values("received_by__username", "method")
            .annotate(total=Sum("amount"), count=Count("id"))
            .order_by("received_by__username")
        )
        totals = inv.aggregate(total=Sum("total"), paid=Sum("paid_amount"), balance=Sum("balance"))
        overdue = inv.filter(status__in=["UNPAID", "PARTIALLY_PAID"], due_date__lt=today).aggregate(
            b=Sum("balance"), n=Count("student", distinct=True)
        )
        discounts = {
            "discounts_active": Discount.objects.filter(status="ACTIVE", academic_year=year).count(),
            "scholarships_active": Scholarship.objects.filter(status="ACTIVE").count(),
            "discount_total": str(inv.aggregate(d=Sum("discount_total"))["d"] or "0.00"),
        }
        s = lambda v: str(v) if v is not None else "0.00"  # noqa: E731
        return Response(
            {
                "academic_year": year.name if year else None,
                "totals": {
                    "billed": s(totals["total"]),
                    "collected": s(totals["paid"]),
                    "outstanding": s(totals["balance"]),
                    "overdue": s(overdue["b"]),
                    "overdue_students": overdue["n"],
                },
                "pending_verifications": Payment.objects.filter(status="PENDING").count(),
                "periods": [{**p, "total": s(p["total"]), "paid": s(p["paid"]), "balance": s(p["balance"])} for p in periods],
                "by_method": [{**m, "total": s(m["total"])} for m in by_method],
                "daily": [{"day": d["day"].isoformat(), "total": s(d["total"]), "count": d["count"]} for d in daily],
                "cashier_today": [
                    {"user": c["received_by__username"], "method": c["method"], "total": s(c["total"]), "count": c["count"]}
                    for c in cashier
                ],
                "discounts": discounts,
            }
        )


class ArrearsView(APIView):
    """Arrears by student with class (PRD §25.8). GET returns JSON; ?export=csv streams an export (audited)."""

    def _rows(self, request):
        p = request.query_params if request.method == "GET" else request.data
        today = timezone.localdate()
        qs = Invoice.objects.filter(status__in=["UNPAID", "PARTIALLY_PAID"])
        if v := p.get("academic_year_id"):
            qs = qs.filter(academic_year_id=v)
        if p.get("overdue_only") in {True, "1", "true"}:
            qs = qs.filter(due_date__lt=today)
        agg = (
            qs.values("student_id", "student__student_no", "student__full_name")
            .annotate(owed=Sum("balance"), invoices=Count("id"), overdue=Sum("balance", filter=Q(due_date__lt=today)))
            .order_by("-owed")
        )
        classes = _class_of()
        rows = [
            {
                "student_id": str(a["student_id"]),
                "student_no": a["student__student_no"],
                "full_name": a["student__full_name"],
                "classroom": classes.get(a["student_id"], ""),
                "invoices": a["invoices"],
                "balance": str(a["owed"]),
                "overdue": str(a["overdue"] or "0.00"),
            }
            for a in agg
        ]
        if v := p.get("classroom"):
            rows = [r for r in rows if r["classroom"] == v]
        return rows

    @extend_schema(
        tags=["finance"],
        parameters=[OpenApiParameter(p, str) for p in ("academic_year_id", "overdue_only", "classroom", "export")],
        responses={200: dict},
    )
    def get(self, request):
        if not user_has_perm(request.user, "finance.view"):
            raise DomainError(ErrorCode.PERMISSION_DENIED, "Anda tidak memiliki izin untuk tindakan ini.", status_code=403)
        rows = self._rows(request)
        if request.query_params.get("export") == "csv":
            if not user_has_perm(request.user, "finance.export"):
                raise DomainError(ErrorCode.PERMISSION_DENIED, "Anda tidak memiliki izin ekspor.", status_code=403)
            buf = io.StringIO()
            w = csv.writer(buf)
            w.writerow(["student_no", "full_name", "classroom", "invoices", "balance_usd", "overdue_usd"])
            for r in rows:
                w.writerow([r["student_no"], r["full_name"], r["classroom"], r["invoices"], r["balance"], r["overdue"]])
            audit.record(
                AuditEvent.EXPORT_GENERATED,
                actor=request.user,
                resource_type="finance.arrears",
                resource_id="csv",
                metadata={"rows": len(rows)},
            )
            resp = HttpResponse(("﻿" + buf.getvalue()).encode("utf-8"), content_type="text/csv; charset=utf-8")
            resp["Content-Disposition"] = f'attachment; filename="tunggakan_{timezone.localdate():%Y%m%d}.csv"'
            return resp
        return Response(rows)

    @extend_schema(tags=["finance"], request=None, responses={200: dict})
    def post(self, request):
        """PRD §25.9 report endpoint; computed synchronously (dataset is one school)."""
        if not user_has_perm(request.user, "finance.view"):
            raise DomainError(ErrorCode.PERMISSION_DENIED, "Anda tidak memiliki izin untuk tindakan ini.", status_code=403)
        with transaction.atomic():
            return Response(self._rows(request))

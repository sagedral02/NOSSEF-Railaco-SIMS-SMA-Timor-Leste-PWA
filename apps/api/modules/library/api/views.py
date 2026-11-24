"""Library endpoints (PRD §28.4). Students/teachers see only their own loans; librarians see all."""

from django.db.models import Count, Q
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from common.api.crud import MasterDataViewSet, ModelCleanSerializer
from common.api.exceptions import DomainError, ErrorCode, ScopeDenied
from common.permissions import ActionPermission, user_has_global
from modules.academics.selectors import teacher_of
from modules.staff.models import Teacher
from modules.students.models import Student

from .. import services
from ..models import LibraryBook, LibraryCopy, LibraryLoan


class BookSerializer(ModelCleanSerializer):
    copies_total = serializers.IntegerField(read_only=True, default=0)
    copies_available = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = LibraryBook
        fields = (
            "id",
            "isbn",
            "title",
            "author",
            "publisher",
            "publication_year",
            "category",
            "language",
            "active",
            "copies_total",
            "copies_available",
        )


class CopySerializer(ModelCleanSerializer):
    book_title = serializers.CharField(source="book.title", read_only=True)

    class Meta:
        model = LibraryCopy
        fields = ("id", "book", "book_title", "barcode", "acquisition_date", "condition", "status", "shelf")
        read_only_fields = ("status",)


class LoanSerializer(serializers.ModelSerializer):
    barcode = serializers.CharField(source="copy.barcode", read_only=True)
    book_title = serializers.CharField(source="copy.book.title", read_only=True)
    borrower_name = serializers.SerializerMethodField()
    borrower_type = serializers.SerializerMethodField()
    overdue = serializers.SerializerMethodField()

    class Meta:
        model = LibraryLoan
        fields = (
            "id",
            "copy",
            "barcode",
            "book_title",
            "student",
            "teacher",
            "borrower_name",
            "borrower_type",
            "borrowed_at",
            "due_at",
            "returned_at",
            "status",
            "fine_amount",
            "renew_count",
            "return_condition",
            "resolution_note",
            "overdue",
        )

    def get_borrower_name(self, obj) -> str:
        return obj.student.full_name if obj.student_id else obj.teacher.full_name

    def get_borrower_type(self, obj) -> str:
        return "STUDENT" if obj.student_id else "TEACHER"

    def get_overdue(self, obj) -> bool:
        from django.utils import timezone

        return obj.status in {"OPEN", "OVERDUE"} and obj.due_at < timezone.now()


class CheckoutSerializer(serializers.Serializer):
    copy = serializers.PrimaryKeyRelatedField(queryset=LibraryCopy.objects.all(), required=False)
    barcode = serializers.CharField(required=False)
    student = serializers.PrimaryKeyRelatedField(queryset=Student.objects.all(), required=False, allow_null=True)
    teacher = serializers.PrimaryKeyRelatedField(queryset=Teacher.objects.all(), required=False, allow_null=True)
    days = serializers.IntegerField(required=False, min_value=1, max_value=60)


class ReturnSerializer(serializers.Serializer):
    condition = serializers.ChoiceField(choices=["GOOD", "DAMAGED", "REPAIR"], default="GOOD")
    note = serializers.CharField(required=False, allow_blank=True, default="")


class NoteSerializer(serializers.Serializer):
    note = serializers.CharField()


class CopyStatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=["AVAILABLE", "LOST", "DAMAGED", "REPAIR", "WITHDRAWN"])
    note = serializers.CharField(required=False, allow_blank=True, default="")


@extend_schema_view(list=extend_schema(parameters=[OpenApiParameter(p, str) for p in ("q", "category", "active")]))
@extend_schema(tags=["library"])
class BookViewSet(MasterDataViewSet):
    serializer_class = BookSerializer
    queryset = LibraryBook.objects.none()
    view_permission = "library.view"
    manage_permission = "library.manage_catalog"
    filter_backends = []

    def get_queryset(self):
        qs = LibraryBook.objects.annotate(
            copies_total=Count("copies", distinct=True),
            copies_available=Count("copies", filter=Q(copies__status="AVAILABLE"), distinct=True),
        )
        p = self.request.query_params
        if q := p.get("q", "").strip():
            qs = qs.filter(Q(title__icontains=q) | Q(author__icontains=q) | Q(isbn__icontains=q) | Q(copies__barcode__iexact=q)).distinct()
        if v := p.get("category"):
            qs = qs.filter(category=v)
        if v := p.get("active"):
            qs = qs.filter(active=v in {"true", "1"})
        return qs.order_by("title")


@extend_schema_view(list=extend_schema(parameters=[OpenApiParameter(p, str) for p in ("book_id", "status", "barcode")]))
@extend_schema(tags=["library"])
class CopyViewSet(MasterDataViewSet):
    serializer_class = CopySerializer
    queryset = LibraryCopy.objects.none()
    view_permission = "library.view"
    manage_permission = "library.manage_catalog"
    extra_permissions = {"set_status": "library.manage_catalog"}
    filter_backends = []
    pagination_class = None

    def get_queryset(self):
        qs = LibraryCopy.objects.select_related("book")
        p = self.request.query_params
        for param, f in (("book_id", "book_id"), ("status", "status"), ("barcode", "barcode__iexact")):
            if v := p.get(param):
                qs = qs.filter(**{f: v})
        return qs

    @extend_schema(request=CopyStatusSerializer, responses={200: CopySerializer})
    @action(detail=True, methods=["post"], url_path="status")
    def set_status(self, request, pk=None):
        data = CopyStatusSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        return Response(CopySerializer(services.set_copy_status(actor=request.user, copy=self.get_object(), **data.validated_data)).data)


def visible_loans(user):
    qs = LibraryLoan.objects.select_related("copy__book", "student", "teacher")
    if user_has_global(user, "library.view") or user_has_global(user, "library.issue"):
        return qs
    teacher = teacher_of(user)
    cond = Q(student__user=user) | Q(student__guardian_links__guardian__user=user, student__guardian_links__active=True)
    if teacher is not None:
        cond |= Q(teacher=teacher)
    return qs.filter(cond).distinct()


@extend_schema_view(list=extend_schema(parameters=[OpenApiParameter(p, str) for p in ("status", "student_id", "teacher_id", "q", "mine")]))
@extend_schema(tags=["library"])
class LoanViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    serializer_class = LoanSerializer
    queryset = LibraryLoan.objects.none()
    permission_classes = [ActionPermission]
    required_permissions = {
        "list": None,
        "retrieve": None,
        "create": "library.issue",
        "return_loan": "library.return",
        "renew": ("library.issue", "library.return"),
        "lost": "library.return",
        "overdue": "library.view",
    }
    filter_backends = []

    def get_queryset(self):
        services.refresh_overdue()
        qs = visible_loans(self.request.user)
        p = self.request.query_params
        if v := p.get("status"):
            qs = qs.filter(status__in=v.split(","))
        for param, f in (("student_id", "student_id"), ("teacher_id", "teacher_id")):
            if v := p.get(param):
                qs = qs.filter(**{f: v})
        if p.get("mine") in {"1", "true"}:
            qs = qs.filter(Q(student__user=self.request.user) | Q(teacher__user=self.request.user))
        if q := p.get("q", "").strip():
            qs = qs.filter(
                Q(copy__barcode__iexact=q)
                | Q(copy__book__title__icontains=q)
                | Q(student__full_name__icontains=q)
                | Q(teacher__full_name__icontains=q)
            )
        return qs

    def get_object(self):
        obj = self.get_queryset().filter(pk=self.kwargs["pk"]).first()
        if obj is None:
            raise ScopeDenied()
        return obj

    @extend_schema(request=CheckoutSerializer, responses={201: LoanSerializer})
    def create(self, request):
        data = CheckoutSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        copy = v.get("copy") or LibraryCopy.objects.filter(barcode__iexact=v.get("barcode", "")).first()
        if copy is None:
            raise DomainError(ErrorCode.VALIDATION_ERROR, "Data tidak valid.", fields={"barcode": ["Barcode tidak ditemukan."]})
        loan = services.checkout(actor=request.user, copy=copy, student=v.get("student"), teacher=v.get("teacher"), days=v.get("days"))
        return Response(LoanSerializer(loan).data, status=status.HTTP_201_CREATED)

    @extend_schema(request=ReturnSerializer, responses={200: LoanSerializer})
    @action(detail=True, methods=["post"], url_path="return")
    def return_loan(self, request, pk=None):
        data = ReturnSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        return Response(LoanSerializer(services.return_loan(actor=request.user, loan=self.get_object(), **data.validated_data)).data)

    @extend_schema(request=None, responses={200: LoanSerializer})
    @action(detail=True, methods=["post"])
    def renew(self, request, pk=None):
        return Response(LoanSerializer(services.renew(actor=request.user, loan=self.get_object())).data)

    @extend_schema(request=NoteSerializer, responses={200: LoanSerializer})
    @action(detail=True, methods=["post"])
    def lost(self, request, pk=None):
        data = NoteSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        return Response(
            LoanSerializer(services.mark_lost(actor=request.user, loan=self.get_object(), note=data.validated_data["note"])).data
        )

    @extend_schema(responses={200: LoanSerializer(many=True)})
    @action(detail=False, methods=["get"])
    def overdue(self, request):
        qs = self.get_queryset().filter(status="OVERDUE").order_by("due_at")
        page = self.paginate_queryset(qs)
        return self.get_paginated_response(LoanSerializer(page, many=True).data)

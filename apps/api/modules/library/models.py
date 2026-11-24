"""Library (PRD §15.65–§15.67, §28). Each physical copy is tracked individually; one open loan per copy enforced by a
partial unique index; exactly one borrower (student or teacher)."""

from django.db import models
from django.db.models import Q

from common.models import BaseModel


class LibraryBook(BaseModel):
    isbn = models.CharField(max_length=30, blank=True, default="")
    title = models.CharField(max_length=250)
    author = models.CharField(max_length=200, blank=True, default="")
    publisher = models.CharField(max_length=200, blank=True, default="")
    publication_year = models.PositiveSmallIntegerField(null=True, blank=True)
    category = models.CharField(max_length=100, blank=True, default="")
    language = models.CharField(max_length=30, blank=True, default="")
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ("title",)
        indexes = [models.Index(fields=["title"]), models.Index(fields=["isbn"]), models.Index(fields=["category"])]

    def __str__(self):
        return self.title


class LibraryCopy(BaseModel):
    class Condition(models.TextChoices):
        GOOD = "GOOD", "Good"
        DAMAGED = "DAMAGED", "Damaged"
        LOST = "LOST", "Lost"
        REPAIR = "REPAIR", "Repair"

    class Status(models.TextChoices):
        AVAILABLE = "AVAILABLE", "Available"
        ON_LOAN = "ON_LOAN", "On loan"
        LOST = "LOST", "Lost"
        DAMAGED = "DAMAGED", "Damaged"
        REPAIR = "REPAIR", "Repair"
        WITHDRAWN = "WITHDRAWN", "Withdrawn"

    book = models.ForeignKey(LibraryBook, on_delete=models.PROTECT, related_name="copies")
    barcode = models.CharField(max_length=80, unique=True)
    acquisition_date = models.DateField(null=True, blank=True)
    condition = models.CharField(max_length=8, choices=Condition.choices, default=Condition.GOOD)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.AVAILABLE)
    shelf = models.CharField(max_length=50, blank=True, default="")

    class Meta:
        ordering = ("barcode",)
        indexes = [models.Index(fields=["book", "status"])]

    def __str__(self):
        return self.barcode


class LibraryLoan(BaseModel):
    class Status(models.TextChoices):
        OPEN = "OPEN", "Open"
        RETURNED = "RETURNED", "Returned"
        OVERDUE = "OVERDUE", "Overdue"
        LOST = "LOST", "Lost"

    copy = models.ForeignKey(LibraryCopy, on_delete=models.PROTECT, related_name="loans")
    student = models.ForeignKey("students.Student", null=True, blank=True, on_delete=models.PROTECT, related_name="library_loans")
    teacher = models.ForeignKey("staff.Teacher", null=True, blank=True, on_delete=models.PROTECT, related_name="library_loans")
    borrowed_at = models.DateTimeField()
    due_at = models.DateTimeField()
    returned_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=8, choices=Status.choices, default=Status.OPEN)
    fine_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    renew_count = models.PositiveSmallIntegerField(default=0)
    return_condition = models.CharField(max_length=8, blank=True, default="")
    resolution_note = models.TextField(blank=True, default="")
    issued_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="+")
    received_by = models.ForeignKey("accounts.User", null=True, blank=True, on_delete=models.PROTECT, related_name="+")

    class Meta:
        ordering = ("-borrowed_at",)
        indexes = [models.Index(fields=["status", "due_at"]), models.Index(fields=["student", "status"])]
        constraints = [
            models.CheckConstraint(
                condition=(Q(student__isnull=False) & Q(teacher__isnull=True)) | (Q(student__isnull=True) & Q(teacher__isnull=False)),
                name="library_one_borrower",
            ),
            models.UniqueConstraint(fields=["copy"], condition=Q(status__in=["OPEN", "OVERDUE"]), name="library_one_open_loan_per_copy"),
            models.CheckConstraint(condition=Q(fine_amount__gte=0), name="library_fine_nonneg"),
        ]

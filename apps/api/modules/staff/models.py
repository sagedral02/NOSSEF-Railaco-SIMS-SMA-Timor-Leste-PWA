"""Teacher and non-teacher staff profiles (PRD §15.12–§15.13, F2-08).

A profile does not implicitly activate a login account (PRD §13.2); `user` links an existing account.
"""

from django.conf import settings
from django.db import models
from django.db.models import Q

from common.models import BaseModel


class Gender(models.TextChoices):
    MALE = "M", "Male"
    FEMALE = "F", "Female"


class EmploymentStatus(models.TextChoices):
    ACTIVE = "ACTIVE", "Active"
    INACTIVE = "INACTIVE", "Inactive"
    LEAVE = "LEAVE", "Leave"
    ENDED = "ENDED", "Ended"


class Teacher(BaseModel):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="teacher_profile")
    employee_no = models.CharField(max_length=50, null=True, blank=True)
    full_name = models.CharField(max_length=200)
    gender = models.CharField(max_length=1, choices=Gender.choices, blank=True, default="")
    phone = models.CharField(max_length=50, blank=True, default="")
    email = models.EmailField(blank=True, default="")
    employment_status = models.CharField(max_length=10, choices=EmploymentStatus.choices, default=EmploymentStatus.ACTIVE)
    join_date = models.DateField(null=True, blank=True)
    leave_date = models.DateField(null=True, blank=True)

    class Meta:
        ordering = ("full_name",)
        constraints = [
            models.UniqueConstraint(
                fields=["employee_no"], condition=Q(employee_no__isnull=False), name="staff_teacher_employee_no_unique"
            ),
            models.CheckConstraint(
                condition=Q(leave_date__isnull=True) | Q(join_date__isnull=True) | Q(leave_date__gte=models.F("join_date")),
                name="staff_teacher_dates_ordered",
            ),
        ]
        indexes = [models.Index(fields=["employment_status"]), models.Index(fields=["full_name"])]

    def __str__(self):
        return self.full_name

    def save(self, *args, **kwargs):
        self.employee_no = (self.employee_no or "").strip() or None
        super().save(*args, **kwargs)


class StaffProfile(BaseModel):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="staff_profile")
    employee_no = models.CharField(max_length=50, null=True, blank=True)
    full_name = models.CharField(max_length=200)
    position = models.CharField(max_length=100)
    department = models.CharField(max_length=100, blank=True, default="")
    employment_status = models.CharField(max_length=10, choices=EmploymentStatus.choices, default=EmploymentStatus.ACTIVE)
    phone = models.CharField(max_length=50, blank=True, default="")

    class Meta:
        ordering = ("full_name",)
        constraints = [
            models.UniqueConstraint(
                fields=["employee_no"], condition=Q(employee_no__isnull=False), name="staff_profile_employee_no_unique"
            ),
        ]
        indexes = [models.Index(fields=["employment_status"]), models.Index(fields=["department"])]

    def __str__(self):
        return self.full_name

    def save(self, *args, **kwargs):
        self.employee_no = (self.employee_no or "").strip() or None
        super().save(*args, **kwargs)

"""Identity: custom User from the first migration, Role, Permission, UserRole (PRD §15.9–§15.11, F1-01/02)."""

import uuid

from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.auth.models import PermissionsMixin
from django.db import models
from django.db.models import Q
from django.db.models.functions import Lower
from django.utils import timezone
from django.utils.functional import cached_property


class Locale(models.TextChoices):
    TETUN = "tet", "Tetun"
    PORTUGUESE = "pt", "Português"
    INDONESIAN = "id", "Bahasa Indonesia"


class AccountStatus(models.TextChoices):
    """PRD §13.2: CREATED/INVITED → ACTIVE ↔ SUSPENDED → DISABLED."""

    CREATED = "CREATED", "Created"
    INVITED = "INVITED", "Invited"
    ACTIVE = "ACTIVE", "Active"
    SUSPENDED = "SUSPENDED", "Suspended"
    DISABLED = "DISABLED", "Disabled"


class UserManager(BaseUserManager):
    use_in_migrations = True

    def _create(self, username, password, **extra):
        if not username:
            raise ValueError("Username is required.")
        user = self.model(username=self.model.normalize_username(username), **extra)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save(using=self._db)
        return user

    def create_user(self, username, password=None, **extra):
        extra.setdefault("account_status", AccountStatus.ACTIVE)
        extra.setdefault("is_active", extra["account_status"] == AccountStatus.ACTIVE)
        return self._create(username, password, **extra)

    def create_superuser(self, username, password=None, **extra):
        extra.update(is_staff=True, is_superuser=True, account_status=AccountStatus.ACTIVE, is_active=True)
        return self._create(username, password, **extra)

    def get_by_natural_key(self, username):
        return self.get(username__iexact=username)


class User(AbstractBaseUser, PermissionsMixin):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    username = models.CharField(max_length=150, unique=True)
    full_name = models.CharField(max_length=200, blank=True, default="")
    email = models.EmailField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False, help_text="Django admin access only.")
    account_status = models.CharField(max_length=16, choices=AccountStatus.choices, default=AccountStatus.ACTIVE)
    preferred_locale = models.CharField(max_length=10, choices=Locale.choices, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = UserManager()

    USERNAME_FIELD = "username"
    EMAIL_FIELD = "email"
    REQUIRED_FIELDS = []

    class Meta:
        constraints = [
            models.UniqueConstraint(Lower("username"), name="accounts_user_username_ci_unique"),
            models.UniqueConstraint(Lower("email"), condition=Q(email__isnull=False), name="accounts_user_email_ci_unique"),
            models.CheckConstraint(
                condition=Q(is_active=False) | Q(account_status="ACTIVE"),
                name="accounts_user_active_matches_status",
            ),
        ]
        indexes = [models.Index(fields=["is_active"])]

    @classmethod
    def normalize_username(cls, username):
        return super().normalize_username(username).strip().lower()

    def save(self, *args, **kwargs):
        self.username = self.normalize_username(self.username)
        if self.email:
            self.email = self.email.strip().lower()
        else:
            self.email = None
        super().save(*args, **kwargs)

    def __str__(self):
        return self.username

    @cached_property
    def active_role_codes(self):
        now = timezone.now()
        return set(UserRole.objects.active(now).filter(user=self, role__active=True).values_list("role__code", flat=True))

    @cached_property
    def capabilities(self):
        """Union of permission codes from active roles (PRD §55: deny by default)."""
        if not self.is_active:
            return frozenset()
        now = timezone.now()
        role_ids = UserRole.objects.active(now).filter(user=self, role__active=True).values_list("role_id", flat=True)
        return frozenset(RolePermission.objects.filter(role_id__in=role_ids).values_list("permission__code", flat=True))

    def has_role(self, code):
        return code in self.active_role_codes


class Permission(models.Model):
    """Catalog row for a canonical permission code (PRD §7.1)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.CharField(max_length=80, unique=True)
    description = models.CharField(max_length=200, blank=True, default="")

    class Meta:
        ordering = ("code",)

    def __str__(self):
        return self.code


class Role(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=100)
    active = models.BooleanField(default=True)
    permissions = models.ManyToManyField(Permission, through="RolePermission", related_name="roles")

    class Meta:
        ordering = ("code",)

    def __str__(self):
        return self.code


class RolePermission(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    role = models.ForeignKey(Role, on_delete=models.CASCADE, related_name="role_permissions")
    permission = models.ForeignKey(Permission, on_delete=models.PROTECT, related_name="role_permissions")

    class Meta:
        constraints = [models.UniqueConstraint(fields=["role", "permission"], name="accounts_role_permission_unique")]

    def __str__(self):
        return f"{self.role_id}:{self.permission_id}"


class UserRoleQuerySet(models.QuerySet):
    def active(self, at=None):
        at = at or timezone.now()
        return self.filter(
            Q(revoked_at__isnull=True),
            Q(valid_from__isnull=True) | Q(valid_from__lte=at),
            Q(valid_until__isnull=True) | Q(valid_until__gt=at),
            user__is_active=True,
        )


class UserRole(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.PROTECT, related_name="user_roles")
    role = models.ForeignKey(Role, on_delete=models.PROTECT, related_name="user_roles")
    valid_from = models.DateTimeField(null=True, blank=True)
    valid_until = models.DateTimeField(null=True, blank=True)
    assigned_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    revoked_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.PROTECT, related_name="+")

    objects = UserRoleQuerySet.as_manager()

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["user", "role"], condition=Q(revoked_at__isnull=True), name="accounts_userrole_one_active"),
            models.CheckConstraint(
                condition=Q(valid_until__isnull=True) | Q(valid_from__isnull=True) | Q(valid_until__gt=models.F("valid_from")),
                name="accounts_userrole_valid_range",
            ),
        ]
        indexes = [models.Index(fields=["user"]), models.Index(fields=["role"])]

    def __str__(self):
        return f"{self.user_id}:{self.role_id}"


class UserSession(models.Model):
    """Tracks session keys per user so disabling an account revokes every session (PRD §13.2)."""

    session_key = models.CharField(max_length=40, primary_key=True)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="sessions")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.session_key

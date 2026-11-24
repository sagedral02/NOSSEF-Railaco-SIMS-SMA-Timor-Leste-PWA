"""Account workflows: login, password reset, lifecycle, role assignment (PRD §13, F1-04..F1-10)."""

from django.conf import settings
from django.contrib.auth import login as django_login
from django.contrib.auth import logout as django_logout
from django.contrib.auth import password_validation, update_session_auth_hash
from django.contrib.auth.tokens import default_token_generator
from django.contrib.sessions.models import Session
from django.core.mail import send_mail
from django.db import transaction
from django.utils import timezone
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode

from common.api.exceptions import ConflictError, DomainError, ErrorCode
from common.permissions import user_has_perm
from modules.audit import services as audit
from modules.audit.events import AuditEvent

from .catalog import PRIVILEGED_ROLES
from .models import AccountStatus, Permission, Role, RolePermission, User, UserRole, UserSession

INVALID_CREDENTIALS = "Username atau kata sandi salah."


def _snapshot(user):
    return {
        "username": user.username,
        "full_name": user.full_name,
        "email": user.email,
        "account_status": user.account_status,
        "preferred_locale": user.preferred_locale,
    }


# ---------------------------------------------------------------- authentication


def login(request, *, username, password):
    """Authenticate and start a rotated session. Raises DomainError; never reveals which part failed,
    except that an inactive account is reported only after the password is proven correct."""
    normalized = User.normalize_username(username or "")
    user = User.objects.filter(username=normalized).first()
    if user is None or not user.check_password(password or ""):
        with transaction.atomic():
            audit.record(
                AuditEvent.LOGIN_FAILURE,
                resource_type="accounts.user",
                resource_id=str(user.pk) if user else "",
                metadata={"username": normalized[:150], "reason": "invalid_credentials"},
            )
        raise DomainError(ErrorCode.AUTH_INVALID_CREDENTIALS, INVALID_CREDENTIALS, status_code=400)
    if not user.is_active or user.account_status != AccountStatus.ACTIVE:
        with transaction.atomic():
            audit.record(
                AuditEvent.LOGIN_FAILURE,
                resource=user,
                metadata={"username": normalized, "reason": "inactive", "status": user.account_status},
            )
        raise DomainError(ErrorCode.AUTH_ACCOUNT_INACTIVE, "Akun tidak aktif. Hubungi admin sekolah.", status_code=403)

    user.backend = settings.AUTHENTICATION_BACKENDS[0]
    django_login(request, user)  # rotates the session key (session fixation protection)
    with transaction.atomic():
        UserSession.objects.update_or_create(session_key=request.session.session_key, defaults={"user": user})
        audit.record(AuditEvent.LOGIN_SUCCESS, actor=user, resource=user)
    return user


def logout(request):
    user = request.user if request.user.is_authenticated else None
    key = request.session.session_key
    if user:
        audit.record(AuditEvent.LOGOUT, actor=user, resource=user)
    django_logout(request)
    if key:
        UserSession.objects.filter(session_key=key).delete()


def revoke_sessions(user, *, keep_session_key=None):
    keys = list(UserSession.objects.filter(user=user).values_list("session_key", flat=True))
    keys = [k for k in keys if k != keep_session_key]
    Session.objects.filter(session_key__in=keys).delete()
    UserSession.objects.filter(session_key__in=keys).delete()


# ---------------------------------------------------------------- password


def request_password_reset(*, identifier):
    """Always behaves the same whether or not the account exists (no enumeration)."""
    ident = (identifier or "").strip().lower()
    if not ident:
        return
    user = (
        User.objects.filter(is_active=True, account_status=AccountStatus.ACTIVE).filter(username=ident).first()
        or User.objects.filter(is_active=True, account_status=AccountStatus.ACTIVE, email__iexact=ident).first()
    )
    if user is None or not user.email:
        return
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    link = f"{settings.WEB_APP_URL.rstrip('/')}/reset-password?uid={uid}&token={token}"
    send_mail(
        subject="Reset kata sandi SIMS NOSSEF",
        message=f"Gunakan tautan berikut untuk mengatur kata sandi baru (berlaku 1 jam):\n{link}\n",
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        fail_silently=True,
    )


def confirm_password_reset(*, uid, token, new_password):
    try:
        user = User.objects.get(pk=force_str(urlsafe_base64_decode(uid)))
    except (User.DoesNotExist, ValueError, TypeError, OverflowError):
        user = None
    if user is None or not default_token_generator.check_token(user, token):
        raise DomainError(ErrorCode.AUTH_RESET_TOKEN_INVALID, "Tautan reset tidak valid atau sudah kedaluwarsa.")
    _validate_password(new_password, user)
    with transaction.atomic():
        user.set_password(new_password)  # changes the hash -> token becomes single-use
        user.save(update_fields=["password", "updated_at"])
        revoke_sessions(user)
        audit.record(AuditEvent.PASSWORD_RESET, actor=user, resource=user)
    return user


def change_password(request, *, current_password, new_password):
    user = request.user
    if not user.check_password(current_password or ""):
        raise DomainError(ErrorCode.VALIDATION_ERROR, "Data tidak valid.", fields={"current_password": ["Kata sandi salah."]})
    _validate_password(new_password, user)
    with transaction.atomic():
        user.set_password(new_password)
        user.save(update_fields=["password", "updated_at"])
        update_session_auth_hash(request, user)
        revoke_sessions(user, keep_session_key=request.session.session_key)
        audit.record(AuditEvent.PASSWORD_CHANGED, actor=user, resource=user)


def _validate_password(password, user):
    from django.core.exceptions import ValidationError

    try:
        password_validation.validate_password(password or "", user)
    except ValidationError as exc:
        raise DomainError(ErrorCode.VALIDATION_ERROR, "Data tidak valid.", fields={"new_password": exc.messages})


# ---------------------------------------------------------------- user administration


@transaction.atomic
def create_user(*, actor, username, full_name="", email=None, password=None, preferred_locale="", roles=()):
    username = User.normalize_username(username)
    if User.objects.filter(username=username).exists():
        raise DomainError(ErrorCode.VALIDATION_ERROR, "Data tidak valid.", fields={"username": ["Username sudah dipakai."]})
    if email and User.objects.filter(email__iexact=email).exists():
        raise DomainError(ErrorCode.VALIDATION_ERROR, "Data tidak valid.", fields={"email": ["Email sudah dipakai."]})
    if password:
        _validate_password(password, User(username=username, email=email, full_name=full_name))
    # PRD §13.2: an account without a password starts as CREATED (inactive) until a reset/invite sets one.
    status = AccountStatus.ACTIVE if password else AccountStatus.CREATED
    user = User.objects.create_user(
        username,
        password,
        full_name=full_name,
        email=email or None,
        preferred_locale=preferred_locale,
        account_status=status,
        is_active=status == AccountStatus.ACTIVE,
    )
    audit.record(AuditEvent.USER_CREATED, actor=actor, resource=user, after=_snapshot(user))
    for code in roles:
        assign_role(actor=actor, user=user, role_code=code)
    return user


@transaction.atomic
def update_user(*, actor, user, data):
    user = User.objects.select_for_update().get(pk=user.pk)
    before = _snapshot(user)
    for field in ("full_name", "email", "preferred_locale"):
        if field in data:
            setattr(user, field, data[field] or ("" if field != "email" else None))
    if user.email and User.objects.filter(email__iexact=user.email).exclude(pk=user.pk).exists():
        raise DomainError(ErrorCode.VALIDATION_ERROR, "Data tidak valid.", fields={"email": ["Email sudah dipakai."]})
    user.save()
    b, a = audit.diff(before, _snapshot(user))
    if a:
        audit.record(AuditEvent.USER_UPDATED, actor=actor, resource=user, before=b, after=a)
    return user


_TRANSITIONS = {
    AccountStatus.ACTIVE: {AccountStatus.CREATED, AccountStatus.INVITED, AccountStatus.SUSPENDED},
    AccountStatus.SUSPENDED: {AccountStatus.ACTIVE},
    AccountStatus.DISABLED: {AccountStatus.CREATED, AccountStatus.INVITED, AccountStatus.ACTIVE, AccountStatus.SUSPENDED},
}
_EVENTS = {
    AccountStatus.ACTIVE: AuditEvent.USER_ACTIVATED,
    AccountStatus.SUSPENDED: AuditEvent.USER_SUSPENDED,
    AccountStatus.DISABLED: AuditEvent.USER_DISABLED,
}


@transaction.atomic
def change_status(*, actor, user, target, reason=""):
    user = User.objects.select_for_update().get(pk=user.pk)
    if user.pk == getattr(actor, "pk", None) and target != AccountStatus.ACTIVE:
        raise DomainError(ErrorCode.INVALID_STATE_TRANSITION, "Tidak dapat menonaktifkan akun sendiri.", status_code=409)
    if user.account_status not in _TRANSITIONS[target]:
        raise ConflictError(
            ErrorCode.INVALID_STATE_TRANSITION,
            f"Status {user.account_status} tidak dapat diubah menjadi {target}.",
        )
    if target == AccountStatus.ACTIVE and not user.has_usable_password():
        raise DomainError(ErrorCode.INVALID_STATE_TRANSITION, "Akun belum memiliki kata sandi.", status_code=409)
    before = user.account_status
    user.account_status = target
    user.is_active = target == AccountStatus.ACTIVE
    user.save(update_fields=["account_status", "is_active", "updated_at"])
    if not user.is_active:
        revoke_sessions(user)
    if target == AccountStatus.DISABLED:
        now = timezone.now()
        for link in UserRole.objects.select_for_update(of=("self",)).select_related("role").filter(user=user, revoked_at__isnull=True):
            link.revoked_at = now
            link.revoked_by = actor if getattr(actor, "is_authenticated", False) else None
            link.save(update_fields=["revoked_at", "revoked_by"])
            audit.record(
                AuditEvent.ROLE_REMOVED,
                actor=actor,
                resource=user,
                before={"role": link.role.code},
                metadata={"reason": "account_disabled"},
            )
    audit.record(
        _EVENTS[target],
        actor=actor,
        resource=user,
        before={"account_status": before},
        after={"account_status": target},
        metadata={"reason": reason[:500]},
    )
    return user


@transaction.atomic
def set_password_by_admin(*, actor, user, new_password):
    _validate_password(new_password, user)
    user = User.objects.select_for_update().get(pk=user.pk)
    user.set_password(new_password)
    user.save(update_fields=["password", "updated_at"])
    revoke_sessions(user)
    audit.record(AuditEvent.PASSWORD_RESET, actor=actor, resource=user, metadata={"by_admin": True})
    return user


def _ensure_can_assign(actor, role_code):
    if role_code in PRIVILEGED_ROLES and not user_has_perm(actor, "role.manage"):
        raise DomainError(ErrorCode.PERMISSION_DENIED, "Peran ini hanya dapat diberikan oleh Super Admin.", status_code=403)


@transaction.atomic
def assign_role(*, actor, user, role_code, valid_from=None, valid_until=None):
    _ensure_can_assign(actor, role_code)
    role = Role.objects.filter(code=role_code, active=True).first()
    if role is None:
        raise DomainError(ErrorCode.VALIDATION_ERROR, "Data tidak valid.", fields={"role": ["Peran tidak dikenal."]})
    if UserRole.objects.filter(user=user, role=role, revoked_at__isnull=True).exists():
        raise ConflictError(ErrorCode.VALIDATION_ERROR, "Peran sudah dimiliki pengguna ini.")
    link = UserRole.objects.create(
        user=user,
        role=role,
        valid_from=valid_from,
        valid_until=valid_until,
        assigned_by=actor if getattr(actor, "is_authenticated", False) else None,
    )
    audit.record(AuditEvent.ROLE_ASSIGNED, actor=actor, resource=user, after={"role": role.code})
    return link


@transaction.atomic
def remove_role(*, actor, user, role_code):
    _ensure_can_assign(actor, role_code)
    link = UserRole.objects.select_for_update().filter(user=user, role__code=role_code, revoked_at__isnull=True).first()
    if link is None:
        raise DomainError(ErrorCode.RESOURCE_NOT_FOUND, "Peran tidak ditemukan pada pengguna ini.", status_code=404)
    if role_code == "SUPER_ADMIN" and not (UserRole.objects.active().filter(role__code="SUPER_ADMIN").exclude(pk=link.pk).exists()):
        raise ConflictError(ErrorCode.INVALID_STATE_TRANSITION, "Minimal harus ada satu Super Admin aktif.")
    link.revoked_at = timezone.now()
    link.revoked_by = actor if getattr(actor, "is_authenticated", False) else None
    link.save(update_fields=["revoked_at", "revoked_by"])
    audit.record(AuditEvent.ROLE_REMOVED, actor=actor, resource=user, before={"role": role_code})


@transaction.atomic
def set_role_permissions(*, actor, role, permission_codes):
    codes = set(permission_codes)
    known = set(Permission.objects.filter(code__in=codes).values_list("code", flat=True))
    unknown = sorted(codes - known)
    if unknown:
        raise DomainError(ErrorCode.VALIDATION_ERROR, "Data tidak valid.", fields={"permissions": [f"Tidak dikenal: {', '.join(unknown)}"]})
    if role.code == "SUPER_ADMIN" and "role.manage" not in codes:
        raise ConflictError(ErrorCode.INVALID_STATE_TRANSITION, "SUPER_ADMIN harus tetap memiliki role.manage.")
    current = set(role.role_permissions.values_list("permission__code", flat=True))
    added, removed = sorted(codes - current), sorted(current - codes)
    if not added and not removed:
        return role
    RolePermission.objects.filter(role=role, permission__code__in=removed).delete()
    perms = {p.code: p for p in Permission.objects.filter(code__in=added)}
    RolePermission.objects.bulk_create([RolePermission(role=role, permission=perms[c]) for c in added])
    audit.record(AuditEvent.PERMISSION_CHANGED, actor=actor, resource=role, metadata={"added": added, "removed": removed})
    return role

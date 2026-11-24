"""Global permission layer (PRD §7: authentication → permission → object scope).

Permission codes come from the canonical catalog (modules/accounts/catalog.py). Views declare
`required_permissions = {"list": "student.view", ...}`; unmapped actions are denied by default.
Object scope is enforced separately by selectors (PRD §65.1), never by the frontend.
"""

from rest_framework.permissions import BasePermission


def user_has_perm(user, code):
    if not user or not user.is_authenticated or not user.is_active:
        return False
    return code in user.capabilities


def user_has_any(user, *codes):
    return any(user_has_perm(user, code) for code in codes)


class ActionPermission(BasePermission):
    """Deny by default. Maps view.action (or HTTP method for APIView) to required codes.

    A value may be a single code, a tuple/list meaning "any of", or None meaning
    "authenticated is enough" (self-scoped endpoints that filter by owner).
    """

    _missing = object()

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        mapping = getattr(view, "required_permissions", {}) or {}
        if getattr(view, "action_map", None) is not None and getattr(view, "action", None) is None:
            return True  # ViewSet has no handler for this method: let DRF answer 405
        key = getattr(view, "action", None) or request.method.lower()
        required = mapping.get(key, mapping.get("*", self._missing))
        if required is self._missing:
            return False
        if required is None:
            return True
        if isinstance(required, (list, tuple, set)):
            return user_has_any(user, *required)
        return user_has_perm(user, required)


def require(*codes):
    """Permission class requiring any of the given codes (for function views / simple APIViews)."""

    class _Require(BasePermission):
        def has_permission(self, request, view):
            return bool(request.user and request.user.is_authenticated and user_has_any(request.user, *codes))

    _Require.__name__ = "Require_" + "_or_".join(code.replace(".", "_") for code in codes)
    return _Require


# Roles whose permissions are always object-scoped (teaching assignment / own data / linked child).
SCOPED_ROLES = frozenset({"TEACHER", "HOMEROOM_TEACHER", "STUDENT", "GUARDIAN"})


def user_has_global(user, code):
    """True when `code` is granted by a role that is NOT object-scoped (e.g. SCHOOL_ADMIN student.view = all students)."""
    if not user_has_perm(user, code):
        return False
    cache = getattr(user, "_global_caps", None)
    if cache is None:
        from django.utils import timezone

        from modules.accounts.models import RolePermission, UserRole

        role_ids = (
            UserRole.objects.active(timezone.now())
            .filter(user=user, role__active=True)
            .exclude(role__code__in=SCOPED_ROLES)
            .values_list("role_id", flat=True)
        )
        cache = frozenset(RolePermission.objects.filter(role_id__in=role_ids).values_list("permission__code", flat=True))
        user._global_caps = cache
    return code in cache

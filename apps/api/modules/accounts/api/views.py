"""Auth + account administration endpoints (PRD §47 Auth rows, §64 /admin/users, /admin/roles)."""

from django.db.models import Prefetch, Q
from django.middleware.csrf import get_token
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from common.api.authentication import SessionAuthentication
from common.permissions import ActionPermission

from .. import services
from ..models import AccountStatus, Role, RolePermission, User, UserRole
from . import serializers as s


def _enforce_csrf(request):
    """Login/reset are reached anonymously, so DRF's session auth would not check CSRF; do it here."""
    SessionAuthentication().enforce_csrf(request)


@method_decorator(ensure_csrf_cookie, name="dispatch")
class CsrfView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    @extend_schema(tags=["auth"], responses={200: dict})
    def get(self, request):
        return Response({"csrf_token": get_token(request)})


class LoginView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    @extend_schema(tags=["auth"], request=s.LoginSerializer, responses={200: s.MeSerializer})
    def post(self, request):
        _enforce_csrf(request)
        data = s.LoginSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        user = services.login(request._request, **data.validated_data)
        return Response(s.MeSerializer(user).data)


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(tags=["auth"], request=None, responses={204: None})
    def post(self, request):
        services.logout(request._request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(tags=["auth"], responses={200: s.MeSerializer})
    def get(self, request):
        return Response(s.MeSerializer(request.user).data)

    @extend_schema(tags=["auth"], request=s.MeUpdateSerializer, responses={200: s.MeSerializer})
    def patch(self, request):
        data = s.MeUpdateSerializer(data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        user = services.update_user(actor=request.user, user=request.user, data=data.validated_data)
        return Response(s.MeSerializer(user).data)


class PasswordChangeView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(tags=["auth"], request=s.PasswordChangeSerializer, responses={204: None})
    def post(self, request):
        data = s.PasswordChangeSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        services.change_password(request._request, **data.validated_data)
        return Response(status=status.HTTP_204_NO_CONTENT)


class PasswordResetRequestView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "password_reset"

    @extend_schema(tags=["auth"], request=s.PasswordResetRequestSerializer, responses={202: dict})
    def post(self, request):
        _enforce_csrf(request)
        data = s.PasswordResetRequestSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        services.request_password_reset(**data.validated_data)
        # Identical response whether or not the account exists (no account enumeration).
        return Response({"accepted": True}, status=status.HTTP_202_ACCEPTED)


class PasswordResetConfirmView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "password_reset"

    @extend_schema(tags=["auth"], request=s.PasswordResetConfirmSerializer, responses={204: None})
    def post(self, request):
        _enforce_csrf(request)
        data = s.PasswordResetConfirmSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        services.confirm_password_reset(**data.validated_data)
        return Response(status=status.HTTP_204_NO_CONTENT)


def _users_queryset():
    active_links = UserRole.objects.active(timezone.now()).select_related("role")
    return User.objects.prefetch_related(Prefetch("user_roles", queryset=active_links, to_attr="active_links"))


@extend_schema(tags=["users"])
class UserViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    serializer_class = s.UserSerializer
    permission_classes = [ActionPermission]
    required_permissions = {
        "list": "user.view",
        "retrieve": "user.view",
        "create": "user.create",
        "partial_update": "user.update",
        "activate": "user.update",
        "suspend": "user.disable",
        "disable": "user.disable",
        "set_password": "user.update",
        "roles": "user.update",
        "remove_role": "user.update",
    }
    filter_backends = []
    http_method_names = ["get", "post", "patch", "delete"]

    def get_queryset(self):
        qs = _users_queryset().order_by("username")
        if self.action == "list":
            params = self.request.query_params
            if q := params.get("q", "").strip():
                qs = qs.filter(Q(username__icontains=q) | Q(full_name__icontains=q) | Q(email__icontains=q))
            if role := params.get("role"):
                qs = qs.filter(user_roles__role__code=role, user_roles__revoked_at__isnull=True).distinct()
            if status_ := params.get("status"):
                qs = qs.filter(account_status=status_)
        return qs

    @extend_schema(parameters=[OpenApiParameter("q", str), OpenApiParameter("role", str), OpenApiParameter("status", str)])
    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

    @extend_schema(request=s.UserCreateSerializer, responses={201: s.UserSerializer})
    def create(self, request):
        data = s.UserCreateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        user = services.create_user(actor=request.user, **data.validated_data)
        return Response(s.UserSerializer(_users_queryset().get(pk=user.pk)).data, status=status.HTTP_201_CREATED)

    @extend_schema(request=s.UserUpdateSerializer, responses={200: s.UserSerializer})
    def partial_update(self, request, pk=None):
        user = self.get_object()
        data = s.UserUpdateSerializer(data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        services.update_user(actor=request.user, user=user, data=data.validated_data)
        return Response(s.UserSerializer(_users_queryset().get(pk=user.pk)).data)

    def _status(self, request, target):
        user = self.get_object()
        data = s.StatusChangeSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        services.change_status(actor=request.user, user=user, target=target, reason=data.validated_data["reason"])
        return Response(s.UserSerializer(_users_queryset().get(pk=user.pk)).data)

    @extend_schema(request=s.StatusChangeSerializer, responses={200: s.UserSerializer})
    @action(detail=True, methods=["post"])
    def activate(self, request, pk=None):
        return self._status(request, AccountStatus.ACTIVE)

    @extend_schema(request=s.StatusChangeSerializer, responses={200: s.UserSerializer})
    @action(detail=True, methods=["post"])
    def suspend(self, request, pk=None):
        return self._status(request, AccountStatus.SUSPENDED)

    @extend_schema(request=s.StatusChangeSerializer, responses={200: s.UserSerializer})
    @action(detail=True, methods=["post"])
    def disable(self, request, pk=None):
        return self._status(request, AccountStatus.DISABLED)

    @extend_schema(request=s.AdminPasswordSerializer, responses={204: None})
    @action(detail=True, methods=["post"], url_path="set-password")
    def set_password(self, request, pk=None):
        user = self.get_object()
        data = s.AdminPasswordSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        services.set_password_by_admin(actor=request.user, user=user, **data.validated_data)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(request=s.RoleAssignSerializer, responses={200: s.UserSerializer})
    @action(detail=True, methods=["post"])
    def roles(self, request, pk=None):
        user = self.get_object()
        data = s.RoleAssignSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        services.assign_role(
            actor=request.user,
            user=user,
            role_code=data.validated_data["role"],
            valid_from=data.validated_data.get("valid_from"),
            valid_until=data.validated_data.get("valid_until"),
        )
        return Response(s.UserSerializer(_users_queryset().get(pk=user.pk)).data)

    @extend_schema(request=None, responses={200: s.UserSerializer})
    @action(detail=True, methods=["delete"], url_path=r"roles/(?P<role_code>[A-Z_]+)")
    def remove_role(self, request, pk=None, role_code=None):
        user = self.get_object()
        services.remove_role(actor=request.user, user=user, role_code=role_code)
        return Response(s.UserSerializer(_users_queryset().get(pk=user.pk)).data)


@extend_schema(tags=["users"])
class RoleViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    serializer_class = s.RoleSerializer
    permission_classes = [ActionPermission]
    required_permissions = {
        "list": ("user.view", "role.manage"),
        "retrieve": ("user.view", "role.manage"),
        "permissions": "role.manage",
        "catalog": ("user.view", "role.manage"),
    }
    pagination_class = None
    filter_backends = []

    def get_queryset(self):
        return Role.objects.prefetch_related(Prefetch("role_permissions", queryset=RolePermission.objects.select_related("permission")))

    @extend_schema(request=s.RolePermissionsSerializer, responses={200: s.RoleSerializer})
    @action(detail=True, methods=["put"])
    def permissions(self, request, pk=None):
        role = self.get_object()
        data = s.RolePermissionsSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        services.set_role_permissions(actor=request.user, role=role, permission_codes=data.validated_data["permissions"])
        return Response(s.RoleSerializer(self.get_queryset().get(pk=role.pk)).data)

    @extend_schema(responses={200: s.PermissionSerializer(many=True)})
    @action(detail=False, methods=["get"])
    def catalog(self, request):
        from ..models import Permission

        return Response(s.PermissionSerializer(Permission.objects.all(), many=True).data)

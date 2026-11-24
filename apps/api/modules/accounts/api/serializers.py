from django.conf import settings
from rest_framework import serializers

from ..models import AccountStatus, Locale, Permission, Role, User


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    password = serializers.CharField(max_length=256, trim_whitespace=False, style={"input_type": "password"})


class PasswordResetRequestSerializer(serializers.Serializer):
    identifier = serializers.CharField(max_length=254, help_text="Username atau email")


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField(max_length=64)
    token = serializers.CharField(max_length=128)
    new_password = serializers.CharField(max_length=256, trim_whitespace=False)


class PasswordChangeSerializer(serializers.Serializer):
    current_password = serializers.CharField(max_length=256, trim_whitespace=False)
    new_password = serializers.CharField(max_length=256, trim_whitespace=False)


class MeSerializer(serializers.ModelSerializer):
    roles = serializers.SerializerMethodField()
    permissions = serializers.SerializerMethodField()
    features = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "full_name",
            "email",
            "preferred_locale",
            "account_status",
            "roles",
            "permissions",
            "features",
        )
        read_only_fields = fields

    def get_roles(self, obj) -> list[str]:
        return sorted(obj.active_role_codes)

    def get_permissions(self, obj) -> list[str]:
        return sorted(obj.capabilities)

    def get_features(self, obj) -> dict[str, bool]:
        return settings.FEATURE_FLAGS


class MeUpdateSerializer(serializers.Serializer):
    preferred_locale = serializers.ChoiceField(choices=Locale.choices, required=False, allow_blank=True)
    full_name = serializers.CharField(max_length=200, required=False)


class UserSerializer(serializers.ModelSerializer):
    roles = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "full_name",
            "email",
            "account_status",
            "is_active",
            "preferred_locale",
            "roles",
            "last_login",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields

    def get_roles(self, obj) -> list[str]:
        # Uses the prefetched active links when available (avoids N+1 on lists).
        links = getattr(obj, "active_links", None)
        if links is not None:
            return sorted(link.role.code for link in links)
        return sorted(obj.active_role_codes)


class UserCreateSerializer(serializers.Serializer):
    username = serializers.RegexField(r"^[a-zA-Z0-9._-]{3,150}$", max_length=150)
    full_name = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")
    email = serializers.EmailField(required=False, allow_null=True, allow_blank=True, default=None)
    password = serializers.CharField(max_length=256, required=False, allow_blank=True, trim_whitespace=False)
    preferred_locale = serializers.ChoiceField(choices=Locale.choices, required=False, allow_blank=True, default="")
    roles = serializers.ListField(child=serializers.CharField(max_length=50), required=False, default=list)


class UserUpdateSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=200, required=False, allow_blank=True)
    email = serializers.EmailField(required=False, allow_null=True, allow_blank=True)
    preferred_locale = serializers.ChoiceField(choices=Locale.choices, required=False, allow_blank=True)


class StatusChangeSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=500, required=False, allow_blank=True, default="")


class AdminPasswordSerializer(serializers.Serializer):
    new_password = serializers.CharField(max_length=256, trim_whitespace=False)


class RoleAssignSerializer(serializers.Serializer):
    role = serializers.CharField(max_length=50)
    valid_from = serializers.DateTimeField(required=False, allow_null=True)
    valid_until = serializers.DateTimeField(required=False, allow_null=True)


class PermissionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Permission
        fields = ("code", "description")


class RoleSerializer(serializers.ModelSerializer):
    permissions = serializers.SerializerMethodField()

    class Meta:
        model = Role
        fields = ("id", "code", "name", "active", "permissions")

    def get_permissions(self, obj) -> list[str]:
        return sorted(rp.permission.code for rp in obj.role_permissions.all())


class RolePermissionsSerializer(serializers.Serializer):
    permissions = serializers.ListField(child=serializers.CharField(max_length=80), allow_empty=True)


ACCOUNT_STATUS_CHOICES = AccountStatus.choices

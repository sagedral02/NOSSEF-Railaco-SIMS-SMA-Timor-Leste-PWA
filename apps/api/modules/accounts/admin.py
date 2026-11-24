from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import Permission, Role, User, UserRole


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    ordering = ("username",)
    list_display = ("username", "full_name", "email", "account_status", "is_active", "is_staff")
    list_filter = ("account_status", "is_active", "is_staff")
    search_fields = ("username", "full_name", "email")
    fieldsets = (
        (None, {"fields": ("username", "password")}),
        ("Profil", {"fields": ("full_name", "email", "preferred_locale")}),
        ("Status", {"fields": ("account_status", "is_active", "is_staff", "is_superuser")}),
        ("Waktu", {"fields": ("last_login",)}),
    )
    add_fieldsets = ((None, {"classes": ("wide",), "fields": ("username", "password1", "password2")}),)
    filter_horizontal = ()


@admin.register(Role)
class RoleAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "active")


@admin.register(Permission)
class PermissionAdmin(admin.ModelAdmin):
    list_display = ("code", "description")


@admin.register(UserRole)
class UserRoleAdmin(admin.ModelAdmin):
    list_display = ("user", "role", "valid_from", "valid_until", "revoked_at")
    list_filter = ("role",)

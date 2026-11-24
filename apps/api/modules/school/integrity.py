"""Integrity checks owned by school/accounts (PRD §54). Each returns (code, ok, detail)."""

from modules.accounts.models import UserRole

from .models import SchoolProfile


def int_001_single_school_profile():
    count = SchoolProfile.objects.count()
    return "INT-001", count == 1, f"SchoolProfile rows: {count}"


def int_025_no_active_role_on_inactive_user():
    # Disabling an account revokes its role links; suspended accounts keep them but grant nothing
    # because capabilities require is_active.
    bad = UserRole.objects.filter(revoked_at__isnull=True, user__account_status="DISABLED").count()
    return "INT-025", bad == 0, f"Unrevoked role links on disabled users: {bad}"

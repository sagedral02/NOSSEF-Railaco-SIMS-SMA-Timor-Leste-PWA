from django.urls import path
from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter()
router.register("users", views.UserViewSet, basename="user")
router.register("roles", views.RoleViewSet, basename="role")

urlpatterns = [
    path("auth/csrf/", views.CsrfView.as_view(), name="auth-csrf"),
    path("auth/login/", views.LoginView.as_view(), name="auth-login"),
    path("auth/logout/", views.LogoutView.as_view(), name="auth-logout"),
    path("auth/me/", views.MeView.as_view(), name="auth-me"),
    path("auth/password/change/", views.PasswordChangeView.as_view(), name="auth-password-change"),
    path("auth/password-reset/request/", views.PasswordResetRequestView.as_view(), name="auth-reset-request"),
    path("auth/password-reset/confirm/", views.PasswordResetConfirmView.as_view(), name="auth-reset-confirm"),
    *router.urls,
]

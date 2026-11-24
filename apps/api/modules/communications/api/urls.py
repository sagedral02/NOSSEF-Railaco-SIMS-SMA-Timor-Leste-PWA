from django.urls import path
from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter()
router.register("announcements", views.AnnouncementViewSet, basename="announcement")
router.register("notifications", views.NotificationViewSet, basename="notification")

urlpatterns = [
    path("notifications/push/", views.PushView.as_view(), name="notification-push"),
    path("notifications/preferences/", views.PreferencesView.as_view(), name="notification-preferences"),
    *router.urls,
]

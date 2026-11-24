from django.urls import path
from rest_framework.routers import SimpleRouter

from .views import GuardianViewSet, PortalChildrenView, StudentViewSet

router = SimpleRouter()
router.register("students", StudentViewSet, basename="student")
router.register("guardians", GuardianViewSet, basename="guardian")

urlpatterns = [path("portal/children/", PortalChildrenView.as_view(), name="portal-children"), *router.urls]

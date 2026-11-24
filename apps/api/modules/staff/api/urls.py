from rest_framework.routers import SimpleRouter

from .views import StaffProfileViewSet, TeacherViewSet

router = SimpleRouter()
router.register("staff/teachers", TeacherViewSet, basename="teacher")
router.register("staff/staff", StaffProfileViewSet, basename="staff-profile")

urlpatterns = router.urls

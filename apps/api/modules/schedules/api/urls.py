from rest_framework.routers import SimpleRouter

from .views import ScheduleExceptionViewSet, ScheduleViewSet

router = SimpleRouter()
router.register("schedules", ScheduleViewSet, basename="schedule")
router.register("schedule-exceptions", ScheduleExceptionViewSet, basename="schedule-exception")

urlpatterns = router.urls

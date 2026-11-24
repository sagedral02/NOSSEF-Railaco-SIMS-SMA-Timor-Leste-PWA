from rest_framework.routers import SimpleRouter

from .views import NationalExamViewSet

router = SimpleRouter()
router.register("national-exams", NationalExamViewSet, basename="national-exam")

urlpatterns = router.urls

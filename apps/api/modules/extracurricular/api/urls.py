from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter()
router.register("extracurricular/activities", views.ActivityViewSet, basename="extracurricular-activity")
router.register("extracurricular/members", views.MembershipViewSet, basename="extracurricular-member")

urlpatterns = router.urls

from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter()
router.register("assets", views.AssetViewSet, basename="asset")

urlpatterns = router.urls

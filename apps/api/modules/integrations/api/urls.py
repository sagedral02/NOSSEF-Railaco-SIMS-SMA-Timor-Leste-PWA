from django.urls import path
from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter()
router.register("imports", views.ImportJobViewSet, basename="import-job")

urlpatterns = [path("imports/template/", views.ImportTemplateView.as_view(), name="import-template"), *router.urls]

from django.urls import path
from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter()
router.register("counseling/cases", views.CaseViewSet, basename="counseling-case")
router.register("discipline/incidents", views.IncidentViewSet, basename="discipline-incident")

urlpatterns = [
    path("counseling/summary/", views.SummaryView.as_view(), name="counseling-summary"),
    path("discipline/notices/", views.NoticesView.as_view(), name="discipline-notices"),
    *router.urls,
]

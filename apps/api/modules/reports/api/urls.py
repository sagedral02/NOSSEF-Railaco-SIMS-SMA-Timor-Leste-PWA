from django.urls import path
from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter()
router.register("reports/jobs", views.JobViewSet, basename="report-job")

urlpatterns = [
    path("reports/catalog/", views.CatalogView.as_view(), name="report-catalog"),
    path("admin/jobs/", views.JobMonitorView.as_view(), name="job-monitor"),
    path("dashboard/", views.DashboardView.as_view(), name="dashboard"),
    *router.urls,
]

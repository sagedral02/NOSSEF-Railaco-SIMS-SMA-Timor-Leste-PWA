from django.urls import path
from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter()
router.register("report-cards", views.ReportCardViewSet, basename="report-card")

urlpatterns = [
    path("report-cards/verify/<str:token>/", views.VerifyView.as_view(), name="report-card-verify"),
    path("students/<uuid:student_id>/transcript/", views.TranscriptView.as_view(), name="student-transcript"),
    path("promotions/preview/", views.PromotionPreviewView.as_view(), name="promotion-preview"),
    path("promotions/execute/", views.PromotionExecuteView.as_view(), name="promotion-execute"),
    *router.urls,
]

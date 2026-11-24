from django.urls import path
from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter()
router.register("admissions/periods", views.PeriodViewSet, basename="admission-period")
router.register("admissions/applicants", views.ApplicantViewSet, basename="applicant")

REG = "<str:registration_no>"
urlpatterns = [
    path("admissions/public/periods/", views.PublicPeriodsView.as_view(), name="admission-public-periods"),
    path("admissions/public/applicants/", views.PublicApplicantCreateView.as_view(), name="admission-public-create"),
    path(f"admissions/public/applicants/{REG}/", views.PublicApplicantView.as_view(), name="admission-public-applicant"),
    path(f"admissions/public/applicants/{REG}/documents/", views.PublicDocumentView.as_view(), name="admission-public-documents"),
    path(f"admissions/public/applicants/{REG}/submit/", views.PublicSubmitView.as_view(), name="admission-public-submit"),
    path("admissions/public/status/", views.PublicStatusView.as_view(), name="admission-public-status"),
    path("admissions/public/recover/", views.PublicRecoverView.as_view(), name="admission-public-recover"),
    *router.urls,
]

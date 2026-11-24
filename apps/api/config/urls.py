from django.conf import settings
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from common.api.views import health_live, health_ready

api_v1 = [
    path("health/live", health_live, name="health-live"),
    path("health/ready", health_ready, name="health-ready"),
    path("", include("modules.accounts.api.urls")),
    path("", include("modules.school.api.urls")),
    path("", include("modules.audit.api.urls")),
    path("", include("modules.staff.api.urls")),
    path("", include("modules.academics.api.urls")),
    path("", include("modules.documents.api.urls")),
    path("", include("modules.students.api.urls")),
    path("", include("modules.admissions.api.urls")),
    path("", include("modules.schedules.api.urls")),
    path("", include("modules.attendance.api.urls")),
    path("", include("modules.assessments.api.urls")),
    path("", include("modules.report_cards.api.urls")),
    path("", include("modules.national_exams.api.urls")),
    path("", include("modules.finance.api.urls")),
    path("", include("modules.counseling.api.urls")),
    path("", include("modules.extracurricular.api.urls")),
    path("", include("modules.library.api.urls")),
    path("", include("modules.assets.api.urls")),
    path("", include("modules.communications.api.urls")),
    path("", include("modules.reports.api.urls")),
    path("", include("modules.integrations.api.urls")),
]

urlpatterns = [
    path("api/v1/", include(api_v1)),
    path("django-admin/", admin.site.urls),
]

if settings.DEBUG:
    urlpatterns += [
        path("api/v1/schema/", SpectacularAPIView.as_view(), name="openapi-schema"),
        path("api/v1/docs/", SpectacularSwaggerView.as_view(url_name="openapi-schema"), name="openapi-docs"),
    ]

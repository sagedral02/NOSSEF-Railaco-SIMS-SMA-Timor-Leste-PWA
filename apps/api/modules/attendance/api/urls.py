from django.urls import path
from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter()
router.register("attendance/sessions", views.SessionViewSet, basename="attendance-session")
router.register("leave-requests", views.LeaveViewSet, basename="leave-request")
router.register("attendance/staff", views.StaffAttendanceViewSet, basename="staff-attendance")

urlpatterns = [
    path("attendance/records/<uuid:pk>/correct/", views.RecordCorrectView.as_view(), name="attendance-correct"),
    path("attendance/offline-sync/", views.OfflineSyncView.as_view(), name="attendance-offline-sync"),
    path("attendance/offline/sync/", views.OfflineSyncView.as_view(), name="attendance-offline-sync-alias"),
    path("attendance/my-classes/", views.MyClassesView.as_view(), name="attendance-my-classes"),
    path("attendance/class-report/", views.ClassReportView.as_view(), name="attendance-class-report"),
    path("attendance/students/<uuid:student_id>/summary/", views.StudentSummaryView.as_view(), name="attendance-student-summary"),
    path("attendance/student/<uuid:student_id>/summary/", views.StudentSummaryView.as_view(), name="attendance-student-summary-alias"),
    *router.urls,
]

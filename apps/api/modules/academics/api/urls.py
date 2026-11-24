from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter()
router.register("academic-years", views.AcademicYearViewSet, basename="academic-year")
router.register("trimestres", views.TrimesterViewSet, basename="trimester")
router.register("grade-levels", views.GradeLevelViewSet, basename="grade-level")
router.register("majors", views.MajorViewSet, basename="major")
router.register("rooms", views.RoomViewSet, basename="room")
router.register("bell-periods", views.BellPeriodViewSet, basename="bell-period")
router.register("calendar-events", views.CalendarEventViewSet, basename="calendar-event")
router.register("subjects", views.SubjectViewSet, basename="subject")
router.register("subject-offerings", views.SubjectOfferingViewSet, basename="subject-offering")
router.register("classrooms", views.ClassRoomViewSet, basename="classroom")
router.register("teaching-assignments", views.TeachingAssignmentViewSet, basename="teaching-assignment")

urlpatterns = router.urls

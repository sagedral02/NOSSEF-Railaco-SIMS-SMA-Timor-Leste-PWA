from django.urls import path
from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter()
router.register("assessment-types", views.AssessmentTypeViewSet, basename="assessment-type")
router.register("grading-schemes", views.SchemeViewSet, basename="grading-scheme")
router.register("assessments", views.AssessmentViewSet, basename="assessment")
router.register("term-grades", views.TermGradeViewSet, basename="term-grade")

urlpatterns = [
    path("gradebook/", views.GradebookView.as_view(), name="gradebook"),
    path("gradebook/my-assignments/", views.MyAssignmentsView.as_view(), name="gradebook-my-assignments"),
    path("grades/completion/", views.CompletionView.as_view(), name="grades-completion"),
    *router.urls,
]

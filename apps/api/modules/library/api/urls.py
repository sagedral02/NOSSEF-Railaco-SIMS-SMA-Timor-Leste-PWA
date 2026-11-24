from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter()
router.register("library/books", views.BookViewSet, basename="library-book")
router.register("library/copies", views.CopyViewSet, basename="library-copy")
router.register("library/loans", views.LoanViewSet, basename="library-loan")

urlpatterns = router.urls

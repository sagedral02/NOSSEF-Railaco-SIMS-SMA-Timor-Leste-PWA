from django.urls import path

from . import views

urlpatterns = [
    path("files/upload/", views.FileUploadView.as_view(), name="file-upload"),
    path("files/<uuid:pk>/", views.FileDetailView.as_view(), name="file-detail"),
    path("files/<uuid:pk>/download/", views.FileDownloadView.as_view(), name="file-download"),
]

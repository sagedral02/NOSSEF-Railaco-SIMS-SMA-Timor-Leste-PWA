from django.apps import AppConfig


class AttendanceConfig(AppConfig):
    name = "modules.attendance"
    label = "attendance"
    default_auto_field = "django.db.models.BigAutoField"

    def ready(self):
        from . import access  # noqa: F401

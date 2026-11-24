from django.apps import AppConfig


class ReportsConfig(AppConfig):
    name = "modules.reports"
    label = "reports"
    default_auto_field = "django.db.models.BigAutoField"

    def ready(self):
        from . import access  # noqa: F401

from django.apps import AppConfig


class ReportCardsConfig(AppConfig):
    name = "modules.report_cards"
    label = "report_cards"
    default_auto_field = "django.db.models.BigAutoField"

    def ready(self):
        from . import access  # noqa: F401

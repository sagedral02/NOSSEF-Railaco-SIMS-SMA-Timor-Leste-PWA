from django.apps import AppConfig


class FinanceConfig(AppConfig):
    name = "modules.finance"
    label = "finance"
    default_auto_field = "django.db.models.BigAutoField"

    def ready(self):
        from . import access  # noqa: F401

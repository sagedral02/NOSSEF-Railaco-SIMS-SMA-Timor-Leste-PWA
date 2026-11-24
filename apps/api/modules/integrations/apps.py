from django.apps import AppConfig


class IntegrationsConfig(AppConfig):
    name = "modules.integrations"
    label = "integrations"
    default_auto_field = "django.db.models.BigAutoField"

    def ready(self):
        from . import access, importers  # noqa: F401

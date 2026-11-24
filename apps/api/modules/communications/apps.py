from django.apps import AppConfig


class CommunicationsConfig(AppConfig):
    name = "modules.communications"
    label = "communications"
    default_auto_field = "django.db.models.BigAutoField"

    def ready(self):
        from . import access, handlers  # noqa: F401

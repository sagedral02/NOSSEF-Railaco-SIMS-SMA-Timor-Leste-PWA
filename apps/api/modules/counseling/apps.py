from django.apps import AppConfig


class CounselingConfig(AppConfig):
    name = "modules.counseling"
    label = "counseling"
    default_auto_field = "django.db.models.BigAutoField"

    def ready(self):
        from . import access  # noqa: F401

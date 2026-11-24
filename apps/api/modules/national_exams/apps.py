from django.apps import AppConfig


class NationalExamsConfig(AppConfig):
    name = "modules.national_exams"
    label = "national_exams"
    default_auto_field = "django.db.models.BigAutoField"

    def ready(self):
        from . import access  # noqa: F401

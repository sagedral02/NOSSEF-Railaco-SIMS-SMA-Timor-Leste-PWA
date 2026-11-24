from django.apps import AppConfig


class AdmissionsConfig(AppConfig):
    name = "modules.admissions"
    label = "admissions"
    default_auto_field = "django.db.models.BigAutoField"

    def ready(self):
        from . import access  # noqa: F401  (registers file access resolver)

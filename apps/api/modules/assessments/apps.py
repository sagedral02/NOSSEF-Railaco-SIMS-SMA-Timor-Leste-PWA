from django.apps import AppConfig


class AssessmentsConfig(AppConfig):
    name = "modules.assessments"
    label = "assessments"
    default_auto_field = "django.db.models.BigAutoField"

    def ready(self):
        from . import importers  # noqa: F401

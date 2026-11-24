from django.apps import AppConfig


class StudentsConfig(AppConfig):
    name = "modules.students"
    label = "students"
    default_auto_field = "django.db.models.BigAutoField"

    def ready(self):
        from . import access  # noqa: F401  (registers file access resolver)

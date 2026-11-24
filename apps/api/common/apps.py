from django.apps import AppConfig


class CommonConfig(AppConfig):
    name = "common"
    default_auto_field = "django.db.models.BigAutoField"

    def ready(self):
        from common.api import schema  # noqa: F401  (registers OpenAPI extensions)

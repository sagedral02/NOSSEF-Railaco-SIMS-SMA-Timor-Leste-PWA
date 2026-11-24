"""Reusable building blocks for master-data endpoints (PRD §36, F2-12).

- Serializer validation runs the model's `full_clean()` so DB-level invariants surface as field errors.
- Writes run in a transaction and append an audit row (`MASTER_DATA_CHANGED`).
- Delete is dependency-safe: rows referenced by history raise 409 `RESOURCE_IN_USE`; archive with `active=false`.
"""

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import ProtectedError, RestrictedError
from rest_framework import serializers, viewsets

from common.api.exceptions import ConflictError, ErrorCode
from common.permissions import ActionPermission
from modules.audit import services as audit

MASTER_DATA_CHANGED = "MASTER_DATA_CHANGED"


class ModelCleanSerializer(serializers.ModelSerializer):
    """Runs Model.full_clean() (incl. CheckConstraint/UniqueConstraint validation) before saving."""

    def validate(self, attrs):
        attrs = super().validate(attrs)
        meta = self.Meta.model._meta
        instance = self.instance or self.Meta.model()
        m2m = {f.name for f in meta.many_to_many}
        for key, value in attrs.items():
            if key not in m2m:
                setattr(instance, key, value)
        try:
            instance.full_clean()
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.message_dict if hasattr(exc, "message_dict") else exc.messages)
        return attrs


def snapshot(instance, fields):
    out = {}
    for f in fields:
        v = getattr(instance, f, None)
        if hasattr(v, "pk"):
            v = str(v.pk)
        elif v is not None and not isinstance(v, (str, int, float, bool, list, dict)):
            v = str(v)
        out[f] = v
    return out


class MasterDataViewSet(viewsets.ModelViewSet):
    """ModelViewSet with permission map, audit trail and dependency-safe delete."""

    permission_classes = [ActionPermission]
    http_method_names = ["get", "post", "patch", "delete"]
    view_permission = None  # str or tuple
    manage_permission = None
    audit_fields = ()

    @property
    def required_permissions(self):
        return {
            "list": self.view_permission,
            "retrieve": self.view_permission,
            "create": self.manage_permission,
            "partial_update": self.manage_permission,
            "destroy": self.manage_permission,
            **getattr(self, "extra_permissions", {}),
        }

    def _fields(self, instance):
        return self.audit_fields or [f.attname for f in instance._meta.concrete_fields if f.name not in {"created_at", "updated_at"}]

    def perform_create(self, serializer):
        with transaction.atomic():
            obj = serializer.save()
            audit.record(
                MASTER_DATA_CHANGED,
                actor=self.request.user,
                resource=obj,
                after=snapshot(obj, self._fields(obj)),
                metadata={"action": "create"},
            )

    def perform_update(self, serializer):
        with transaction.atomic():
            before = snapshot(serializer.instance, self._fields(serializer.instance))
            obj = serializer.save()
            b, a = audit.diff(before, snapshot(obj, self._fields(obj)))
            if a:
                audit.record(MASTER_DATA_CHANGED, actor=self.request.user, resource=obj, before=b, after=a, metadata={"action": "update"})

    def perform_destroy(self, instance):
        try:
            with transaction.atomic():
                before = snapshot(instance, self._fields(instance))
                pk = str(instance.pk)
                label = instance._meta.label_lower
                instance.delete()
                audit.record(
                    MASTER_DATA_CHANGED,
                    actor=self.request.user,
                    resource_type=label,
                    resource_id=pk,
                    before=before,
                    metadata={"action": "delete"},
                )
        except (ProtectedError, RestrictedError):
            raise ConflictError(ErrorCode.RESOURCE_IN_USE, "Data sudah dipakai oleh data lain. Nonaktifkan (arsipkan) saja.")

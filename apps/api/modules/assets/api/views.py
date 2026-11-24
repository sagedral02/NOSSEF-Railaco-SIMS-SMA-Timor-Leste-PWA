"""Asset endpoints (PRD §29). Value/status/ownership changes are audited (MasterDataViewSet diff + workflow events)."""

from django.db.models import Q
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import serializers
from rest_framework.decorators import action
from rest_framework.response import Response

from common.api.crud import MasterDataViewSet, ModelCleanSerializer
from modules.academics.models import Room
from modules.staff.models import StaffProfile, Teacher

from .. import services
from ..models import Asset, AssetAssignment, AssetMaintenance, AssetMovement


class AssignmentSerializer(serializers.ModelSerializer):
    target_name = serializers.SerializerMethodField()
    assigned_by_name = serializers.CharField(source="assigned_by.username", read_only=True)

    class Meta:
        model = AssetAssignment
        fields = (
            "id",
            "assigned_to_type",
            "teacher",
            "staff",
            "room",
            "target_name",
            "assigned_at",
            "returned_at",
            "condition_after",
            "note",
            "assigned_by_name",
        )

    def get_target_name(self, obj) -> str:
        if obj.teacher_id:
            return obj.teacher.full_name
        if obj.staff_id:
            return obj.staff.full_name
        return f"{obj.room.code} — {obj.room.name}" if obj.room_id else ""


class MaintenanceSerializer(serializers.ModelSerializer):
    class Meta:
        model = AssetMaintenance
        fields = ("id", "started_at", "completed_at", "description", "cost", "vendor", "status")


class MovementSerializer(serializers.ModelSerializer):
    from_room_code = serializers.CharField(source="from_room.code", read_only=True, default=None)
    to_room_code = serializers.CharField(source="to_room.code", read_only=True, default=None)
    moved_by_name = serializers.CharField(source="moved_by.username", read_only=True)

    class Meta:
        model = AssetMovement
        fields = ("id", "from_room_code", "to_room_code", "moved_at", "moved_by_name", "note")


class AssetSerializer(ModelCleanSerializer):
    location_room_code = serializers.CharField(source="location_room.code", read_only=True, default=None)
    current_assignment = serializers.SerializerMethodField()

    class Meta:
        model = Asset
        fields = (
            "id",
            "asset_no",
            "name",
            "category",
            "serial_no",
            "purchase_date",
            "purchase_cost",
            "location_room",
            "location_room_code",
            "condition",
            "status",
            "retire_reason",
            "current_assignment",
        )
        read_only_fields = ("status", "retire_reason")

    def get_current_assignment(self, obj) -> dict | None:
        a = next((x for x in obj.assignments.all() if x.returned_at is None), None)
        return AssignmentSerializer(a).data if a else None


class AssetDetailSerializer(AssetSerializer):
    assignments = AssignmentSerializer(many=True, read_only=True)
    maintenance = MaintenanceSerializer(many=True, read_only=True)
    movements = MovementSerializer(many=True, read_only=True)

    class Meta(AssetSerializer.Meta):
        fields = (*AssetSerializer.Meta.fields, "assignments", "maintenance", "movements")


class AssignInput(serializers.Serializer):
    target_type = serializers.ChoiceField(choices=AssetAssignment.Target.choices)
    teacher = serializers.PrimaryKeyRelatedField(queryset=Teacher.objects.all(), required=False, allow_null=True)
    staff = serializers.PrimaryKeyRelatedField(queryset=StaffProfile.objects.all(), required=False, allow_null=True)
    room = serializers.PrimaryKeyRelatedField(queryset=Room.objects.all(), required=False, allow_null=True)
    note = serializers.CharField(required=False, allow_blank=True, default="")


class ReturnInput(serializers.Serializer):
    condition_after = serializers.ChoiceField(choices=Asset.Condition.choices, default="GOOD")
    note = serializers.CharField(required=False, allow_blank=True, default="")


class MaintenanceInput(serializers.Serializer):
    description = serializers.CharField()
    vendor = serializers.CharField(required=False, allow_blank=True, default="")


class CompleteInput(serializers.Serializer):
    maintenance = serializers.PrimaryKeyRelatedField(queryset=AssetMaintenance.objects.all())
    cost = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, allow_null=True)
    status = serializers.ChoiceField(choices=["COMPLETED", "CANCELLED"], default="COMPLETED")
    condition = serializers.ChoiceField(choices=Asset.Condition.choices, default="GOOD")


class TransferInput(serializers.Serializer):
    to_room = serializers.PrimaryKeyRelatedField(queryset=Room.objects.all())
    note = serializers.CharField(required=False, allow_blank=True, default="")


class RetireInput(serializers.Serializer):
    reason = serializers.CharField()
    lost = serializers.BooleanField(default=False)


class ReasonInput(serializers.Serializer):
    reason = serializers.CharField()


@extend_schema_view(list=extend_schema(parameters=[OpenApiParameter(p, str) for p in ("q", "status", "category", "room_id")]))
@extend_schema(tags=["assets"])
class AssetViewSet(MasterDataViewSet):
    serializer_class = AssetSerializer
    queryset = Asset.objects.none()
    view_permission = "asset.view"
    manage_permission = "asset.manage"
    extra_permissions = {
        "assign": "asset.assign",
        "return_asset": "asset.assign",
        "maintenance": "asset.manage",
        "complete_maintenance": "asset.manage",
        "transfer": ("asset.manage", "asset.assign"),
        "retire": "asset.manage",
        "restore": "asset.manage",
    }
    filter_backends = []

    def get_serializer_class(self):
        return AssetDetailSerializer if self.action == "retrieve" else AssetSerializer

    def get_queryset(self):
        qs = Asset.objects.select_related("location_room").prefetch_related(
            "assignments__teacher",
            "assignments__staff",
            "assignments__room",
            "assignments__assigned_by",
            "maintenance",
            "movements__from_room",
            "movements__to_room",
            "movements__moved_by",
        )
        p = self.request.query_params
        if q := p.get("q", "").strip():
            qs = qs.filter(Q(asset_no__icontains=q) | Q(name__icontains=q) | Q(serial_no__icontains=q))
        for param, f in (("status", "status"), ("category", "category"), ("room_id", "location_room_id")):
            if v := p.get(param):
                qs = qs.filter(**{f: v})
        return qs

    def perform_destroy(self, instance):
        from common.api.exceptions import ConflictError, ErrorCode

        if instance.assignments.exists() or instance.maintenance.exists():
            raise ConflictError(ErrorCode.RESOURCE_IN_USE, "Aset memiliki riwayat; gunakan penghapusbukuan (retire).")
        super().perform_destroy(instance)

    def _detail(self, pk):
        return Response(AssetDetailSerializer(self.get_queryset().get(pk=pk)).data)

    @extend_schema(request=AssignInput, responses={200: AssetDetailSerializer})
    @action(detail=True, methods=["post"])
    def assign(self, request, pk=None):
        data = AssignInput(data=request.data)
        data.is_valid(raise_exception=True)
        services.assign(actor=request.user, asset=self.get_object(), **data.validated_data)
        return self._detail(pk)

    @extend_schema(request=ReturnInput, responses={200: AssetDetailSerializer})
    @action(detail=True, methods=["post"], url_path="return")
    def return_asset(self, request, pk=None):
        data = ReturnInput(data=request.data)
        data.is_valid(raise_exception=True)
        services.return_assignment(actor=request.user, asset=self.get_object(), **data.validated_data)
        return self._detail(pk)

    @extend_schema(request=MaintenanceInput, responses={200: AssetDetailSerializer})
    @action(detail=True, methods=["post"])
    def maintenance(self, request, pk=None):
        data = MaintenanceInput(data=request.data)
        data.is_valid(raise_exception=True)
        services.start_maintenance(actor=request.user, asset=self.get_object(), **data.validated_data)
        return self._detail(pk)

    @extend_schema(request=CompleteInput, responses={200: AssetDetailSerializer})
    @action(detail=True, methods=["post"], url_path="maintenance/complete")
    def complete_maintenance(self, request, pk=None):
        asset = self.get_object()
        data = CompleteInput(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        if v["maintenance"].asset_id != asset.pk:
            from common.api.exceptions import ScopeDenied

            raise ScopeDenied()
        services.complete_maintenance(
            actor=request.user, maintenance=v["maintenance"], cost=v.get("cost"), status=v["status"], condition=v["condition"]
        )
        return self._detail(pk)

    @extend_schema(request=TransferInput, responses={200: AssetDetailSerializer})
    @action(detail=True, methods=["post"])
    def transfer(self, request, pk=None):
        data = TransferInput(data=request.data)
        data.is_valid(raise_exception=True)
        services.transfer(actor=request.user, asset=self.get_object(), **data.validated_data)
        return self._detail(pk)

    @extend_schema(request=RetireInput, responses={200: AssetDetailSerializer})
    @action(detail=True, methods=["post"])
    def retire(self, request, pk=None):
        data = RetireInput(data=request.data)
        data.is_valid(raise_exception=True)
        services.retire(actor=request.user, asset=self.get_object(), **data.validated_data)
        return self._detail(pk)

    @extend_schema(request=ReasonInput, responses={200: AssetDetailSerializer})
    @action(detail=True, methods=["post"])
    def restore(self, request, pk=None):
        data = ReasonInput(data=request.data)
        data.is_valid(raise_exception=True)
        services.restore(actor=request.user, asset=self.get_object(), reason=data.validated_data["reason"])
        return self._detail(pk)

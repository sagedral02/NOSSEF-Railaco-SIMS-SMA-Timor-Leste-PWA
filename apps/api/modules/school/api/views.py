from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from common.permissions import ActionPermission

from .. import services
from ..models import SchoolProfile


class SchoolProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = SchoolProfile
        fields = (
            "id",
            "name",
            "code",
            "address",
            "municipality",
            "phone",
            "email",
            "timezone",
            "currency",
            "default_locale",
            "updated_at",
        )
        read_only_fields = ("id", "currency", "updated_at")


class SchoolProfileView(APIView):
    permission_classes = [ActionPermission]
    required_permissions = {"get": None, "patch": "school.manage_settings"}

    @extend_schema(tags=["school"], responses={200: SchoolProfileSerializer})
    def get(self, request):
        return Response(SchoolProfileSerializer(services.get_profile()).data)

    @extend_schema(tags=["school"], request=SchoolProfileSerializer, responses={200: SchoolProfileSerializer})
    def patch(self, request):
        data = SchoolProfileSerializer(services.get_profile(), data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        profile = services.update_profile(actor=request.user, data=data.validated_data)
        return Response(SchoolProfileSerializer(profile).data)

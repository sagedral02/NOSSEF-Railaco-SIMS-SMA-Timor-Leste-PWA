"""Announcement, notification-center and Web Push endpoints (PRD §30, §64 /announcements, /notifications)."""

import hashlib

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from common.api.exceptions import ConflictError, ErrorCode, ScopeDenied
from common.api.pagination import FeedCursorPagination
from common.permissions import ActionPermission, user_has_perm
from modules.academics.models import ClassRoom, GradeLevel, Major
from modules.documents import services as files
from modules.documents.models import StoredFile
from modules.students.models import Student

from .. import services
from ..models import Announcement, AnnouncementAudience, Notification, NotificationPreference, PushSubscription


class AudienceSerializer(serializers.ModelSerializer):
    grade_level = serializers.PrimaryKeyRelatedField(queryset=GradeLevel.objects.all(), required=False, allow_null=True)
    major = serializers.PrimaryKeyRelatedField(queryset=Major.objects.all(), required=False, allow_null=True)
    classroom = serializers.PrimaryKeyRelatedField(queryset=ClassRoom.objects.all(), required=False, allow_null=True)
    student = serializers.PrimaryKeyRelatedField(queryset=Student.objects.all(), required=False, allow_null=True)
    label = serializers.SerializerMethodField()

    class Meta:
        model = AnnouncementAudience
        fields = ("id", "role_code", "grade_level", "major", "classroom", "student", "include_guardians", "label")

    def get_label(self, obj) -> str:
        parts = [
            obj.role_code,
            getattr(obj.grade_level, "code", ""),
            getattr(obj.major, "code", ""),
            getattr(obj.classroom, "name", ""),
            getattr(obj.student, "full_name", ""),
        ]
        return " · ".join(p for p in parts if p)


class AnnouncementSerializer(serializers.ModelSerializer):
    audiences = AudienceSerializer(many=True, required=False)
    created_by_name = serializers.CharField(source="created_by.username", read_only=True)
    attachment = serializers.PrimaryKeyRelatedField(queryset=StoredFile.objects.all(), required=False, allow_null=True)

    class Meta:
        model = Announcement
        fields = (
            "id",
            "title",
            "body",
            "audience_type",
            "priority",
            "publish_at",
            "expire_at",
            "status",
            "attachment",
            "audiences",
            "created_by_name",
            "published_at",
            "created_at",
        )
        read_only_fields = ("status", "published_at", "created_at")

    def validate(self, attrs):
        if self.instance is not None and self.instance.status not in {"DRAFT", "SCHEDULED"}:
            raise serializers.ValidationError({"non_field_errors": ["Pengumuman terbit tidak dapat diubah; arsipkan dan buat baru."]})
        pub = attrs.get("publish_at") or getattr(self.instance, "publish_at", None)
        exp = attrs.get("expire_at", getattr(self.instance, "expire_at", None))
        if pub and exp and exp <= pub:
            raise serializers.ValidationError({"expire_at": ["Harus setelah waktu terbit."]})
        if attrs.get("attachment") is not None:
            files.attach(attrs["attachment"], expected_purposes={"ANNOUNCEMENT_ATTACHMENT"})
        return attrs

    @transaction.atomic
    def create(self, validated):
        auds = validated.pop("audiences", [])
        a = Announcement.objects.create(created_by=self.context["request"].user, **validated)
        for x in auds:
            AnnouncementAudience.objects.create(announcement=a, **x)
        return a

    @transaction.atomic
    def update(self, instance, validated):
        auds = validated.pop("audiences", None)
        for k, v in validated.items():
            setattr(instance, k, v)
        instance.status = "DRAFT"
        instance.save()
        if auds is not None:
            instance.audiences.all().delete()
            for x in auds:
                AnnouncementAudience.objects.create(announcement=instance, **x)
        return instance


@extend_schema_view(list=extend_schema(parameters=[OpenApiParameter("status", str)]))
@extend_schema(tags=["communications"])
class AnnouncementViewSet(
    mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet
):
    serializer_class = AnnouncementSerializer
    queryset = Announcement.objects.none()
    permission_classes = [ActionPermission]
    required_permissions = {
        "list": "announcement.publish",
        "retrieve": None,
        "create": "announcement.publish",
        "partial_update": "announcement.publish",
        "publish": "announcement.publish",
        "archive": "announcement.publish",
        "feed": None,
    }
    http_method_names = ["get", "post", "patch"]
    filter_backends = []

    def get_queryset(self):
        qs = Announcement.objects.select_related("created_by").prefetch_related(
            "audiences__grade_level", "audiences__major", "audiences__classroom", "audiences__student"
        )
        if v := self.request.query_params.get("status"):
            qs = qs.filter(status=v)
        return qs

    def get_object(self):
        obj = self.get_queryset().filter(pk=self.kwargs["pk"]).first()
        if obj is None or not (
            user_has_perm(self.request.user, "announcement.publish") or obj in services.announcements_for(self.request.user)
        ):
            raise ScopeDenied()
        return obj

    @extend_schema(request=None, responses={200: AnnouncementSerializer})
    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        return Response(AnnouncementSerializer(services.publish(actor=request.user, announcement=self.get_object())).data)

    @extend_schema(request=None, responses={200: AnnouncementSerializer})
    @action(detail=True, methods=["post"])
    def archive(self, request, pk=None):
        return Response(AnnouncementSerializer(services.archive(actor=request.user, announcement=self.get_object())).data)

    @extend_schema(responses={200: AnnouncementSerializer(many=True)})
    @action(detail=False, methods=["get"])
    def feed(self, request):
        """Current announcements for the signed-in user (portal + staff)."""
        items = services.announcements_for(request.user)
        return Response(AnnouncementSerializer(items[:50], many=True).data)


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ("id", "type", "title", "body", "target_url", "read_at", "created_at")


class InboxPagination(FeedCursorPagination):
    page_size = 20
    max_page_size = 100
    page_size_query_param = "page_size"
    ordering = ("-created_at", "-id")


class MarkReadSerializer(serializers.Serializer):
    ids = serializers.ListField(child=serializers.UUIDField(), required=False)


@extend_schema_view(list=extend_schema(parameters=[OpenApiParameter("unread", str)]))
@extend_schema(tags=["communications"])
class NotificationViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    serializer_class = NotificationSerializer
    queryset = Notification.objects.none()
    permission_classes = [ActionPermission]
    required_permissions = {"list": None, "unread_count": None, "read": None}
    pagination_class = InboxPagination
    filter_backends = []

    def get_queryset(self):
        qs = Notification.objects.filter(recipient=self.request.user)
        if self.request.query_params.get("unread") in {"1", "true"}:
            qs = qs.filter(read_at__isnull=True)
        return qs

    @extend_schema(responses={200: dict})
    @action(detail=False, methods=["get"], url_path="unread-count")
    def unread_count(self, request):
        return Response({"unread": Notification.objects.filter(recipient=request.user, read_at__isnull=True).count()})

    @extend_schema(request=MarkReadSerializer, responses={200: dict})
    @action(detail=False, methods=["post"])
    def read(self, request):
        data = MarkReadSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        return Response({"updated": services.mark_read(request.user, data.validated_data.get("ids"))})


class SubscribeSerializer(serializers.Serializer):
    endpoint = serializers.URLField(max_length=1000)
    keys = serializers.DictField(child=serializers.CharField())


class PushView(APIView):
    """GET → VAPID public key + whether push is enabled; POST → subscribe device; DELETE → revoke device."""

    @extend_schema(tags=["communications"], responses={200: dict})
    def get(self, request):
        enabled = bool(settings.FEATURE_FLAGS.get("ENABLE_WEB_PUSH") and settings.VAPID_PUBLIC_KEY)
        return Response(
            {
                "enabled": enabled,
                "public_key": settings.VAPID_PUBLIC_KEY if enabled else "",
                "devices": PushSubscription.objects.filter(user=request.user, active=True).count(),
            }
        )

    @extend_schema(tags=["communications"], request=SubscribeSerializer, responses={201: dict})
    def post(self, request):
        data = SubscribeSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        keys = data.validated_data["keys"]
        if not settings.FEATURE_FLAGS.get("ENABLE_WEB_PUSH"):
            raise ConflictError(ErrorCode.FEATURE_DISABLED, "Web Push belum diaktifkan sekolah.")
        services.subscribe(
            user=request.user,
            endpoint=data.validated_data["endpoint"],
            p256dh=keys.get("p256dh", ""),
            auth=keys.get("auth", ""),
            user_agent=request.headers.get("User-Agent", ""),
        )
        return Response({"subscribed": True}, status=status.HTTP_201_CREATED)

    @extend_schema(tags=["communications"], request=SubscribeSerializer, responses={200: dict})
    def delete(self, request):
        endpoint = request.data.get("endpoint", "")
        n = PushSubscription.objects.filter(user=request.user, endpoint_hash=hashlib.sha256(endpoint.encode()).hexdigest()).update(
            active=False, updated_at=timezone.now()
        )
        return Response({"revoked": n})


EVENT_TYPES = [
    "attendance.absent",
    "attendance.late",
    "finance.invoice.overdue",
    "finance.payment.verified",
    "finance.payment.reversed",
    "report_card.published",
    "schedule.changed",
    "announcement.published",
    "discipline.notice",
]


class PreferenceSerializer(serializers.Serializer):
    event_type = serializers.ChoiceField(choices=EVENT_TYPES)
    push_enabled = serializers.BooleanField()
    email_enabled = serializers.BooleanField()


class PreferencesView(APIView):
    @extend_schema(tags=["communications"], responses={200: PreferenceSerializer(many=True)})
    def get(self, request):
        saved = {p.event_type: p for p in NotificationPreference.objects.filter(user=request.user)}
        return Response(
            [
                {
                    "event_type": e,
                    "push_enabled": saved[e].push_enabled if e in saved else True,
                    "email_enabled": saved[e].email_enabled if e in saved else False,
                }
                for e in EVENT_TYPES
            ]
        )

    @extend_schema(tags=["communications"], request=PreferenceSerializer(many=True), responses={200: PreferenceSerializer(many=True)})
    def put(self, request):
        data = PreferenceSerializer(data=request.data, many=True)
        data.is_valid(raise_exception=True)
        for p in data.validated_data:
            NotificationPreference.objects.update_or_create(
                user=request.user,
                event_type=p["event_type"],
                defaults={"push_enabled": p["push_enabled"], "email_enabled": p["email_enabled"]},
            )
        return self.get(request)

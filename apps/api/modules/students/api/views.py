"""Student/guardian endpoints (PRD §47 Students rows, §17.4 Student 360)."""

import csv
import io

from django.db.models import Q
from django.http import HttpResponse
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from common.api.exceptions import DomainError, ErrorCode, ScopeDenied
from common.permissions import ActionPermission, user_has_global, user_has_perm
from modules.academics.models import ClassRoom
from modules.audit import services as audit
from modules.audit.events import AuditEvent
from modules.documents import services as files

from .. import services
from ..documents import student_documents
from ..models import EnrollmentStatus, Guardian, Student, StudentGuardian
from ..selectors import active_enrollment_prefetch, guardian_links, students_visible_to
from . import serializers as s

LIST_PARAMS = [
    OpenApiParameter(p, str) for p in ("q", "status", "academic_year_id", "classroom_id", "grade_level_id", "major_id", "view", "ids")
]
ARCHIVED_STATUSES = ("GRADUATED", "TRANSFERRED", "LEFT", "INACTIVE")


def filter_students(qs, params, user=None):
    if q := params.get("q", "").strip():
        qs = qs.filter(Q(full_name__icontains=q) | Q(student_no__icontains=q) | Q(national_student_no__icontains=q))
    if st := params.get("status"):
        qs = qs.filter(status=st)
    # Bulk actions send explicit selected ids (PRD §35.4); still intersected with the caller's scope.
    if ids := params.get("ids"):
        qs = qs.filter(pk__in=[i for i in ids.split(",")[:200] if i])
    # Directory views (ui.md SCREEN-05). Scholarship is finance data: only finance/whole-school staff may filter by it.
    view = params.get("view")
    if view == "archive":
        qs = qs.filter(status__in=ARCHIVED_STATUSES)
    elif view == "president":
        qs = qs.filter(pk__in=ClassRoom.objects.filter(class_president__isnull=False, active=True).values("class_president"))
    elif view == "scholarship":
        if user is None or not (user_has_global(user, "finance.view") or user_has_global(user, "student.view")):
            raise ScopeDenied()
        qs = qs.filter(scholarships__status="ACTIVE").distinct()
    enr = {}
    for p, f in (
        ("academic_year_id", "academic_year_id"),
        ("classroom_id", "classroom_id"),
        ("grade_level_id", "grade_level_id"),
        ("major_id", "major_id"),
    ):
        if v := params.get(p):
            enr[f"enrollments__{f}"] = v
    if enr:
        qs = qs.filter(**enr, enrollments__status=EnrollmentStatus.ACTIVE).distinct()
    return qs


@extend_schema_view(list=extend_schema(parameters=LIST_PARAMS))
@extend_schema(tags=["students"])
class StudentViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    queryset = Student.objects.none()  # schema introspection only; real queryset is scoped per request
    permission_classes = [ActionPermission]
    required_permissions = {
        "list": "student.view",
        "retrieve": None,  # object scope decides (staff scope, linked guardian, or self)
        "create": "student.create",
        "partial_update": "student.update",
        "enrollments": None,
        "enroll": "student.update",
        "transfer": "student.update",
        "change_status": "student.change_status",
        "guardians": None,
        "remove_guardian": "guardian.update",
        "status_history": None,
        "transfers": None,
        "documents": None,
        "qr": None,
        "portal_account": "user.create",
        "photo": "student.update",
        "export": "student.export",
    }
    filter_backends = []
    http_method_names = ["get", "post", "patch", "delete"]

    def get_queryset(self):
        qs = students_visible_to(self.request.user).prefetch_related(active_enrollment_prefetch())
        if self.action == "list":
            qs = filter_students(qs, self.request.query_params, self.request.user)
        return qs.order_by("full_name")

    def get_serializer_class(self):
        return s.StudentListSerializer if self.action == "list" else s.StudentDetailSerializer

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        user = self.request.user
        ctx["limited"] = not (user_has_global(user, "student.view") or user_has_perm(user, "guardian.view")) and not (
            getattr(user, "guardian_profile", None) or getattr(user, "student_profile", None)
        )
        return ctx

    def _student(self):
        obj = self.get_queryset().filter(pk=self.kwargs["pk"]).first()
        if obj is None:
            raise ScopeDenied()
        return obj

    def get_object(self):
        return self._student()

    def _detail(self, student):
        student = self.get_queryset().get(pk=student.pk)
        return s.StudentDetailSerializer(student, context=self.get_serializer_context()).data

    @extend_schema(request=s.StudentCreateSerializer, responses={201: s.StudentDetailSerializer})
    def create(self, request):
        data = s.StudentCreateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v = dict(data.validated_data)
        classroom, start = v.pop("classroom", None), v.pop("start_date", None)
        student = services.create_student(actor=request.user, data=v, classroom=classroom, start_date=start)
        return Response(self._detail(student), status=status.HTTP_201_CREATED)

    @extend_schema(request=s.StudentWriteSerializer, responses={200: s.StudentDetailSerializer})
    def partial_update(self, request, pk=None):
        student = self._student()
        if not user_has_global(request.user, "student.update"):
            raise DomainError(ErrorCode.PERMISSION_DENIED, "Anda tidak memiliki izin untuk tindakan ini.", status_code=403)
        data = s.StudentWriteSerializer(student, data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        services.update_student(actor=request.user, student=student, data=data.validated_data)
        return Response(self._detail(student))

    @extend_schema(responses={200: s.EnrollmentSerializer(many=True)})
    @action(detail=True, methods=["get"])
    def enrollments(self, request, pk=None):
        student = self._student()
        qs = student.enrollments.select_related("academic_year", "grade_level", "major", "classroom")
        return Response(s.EnrollmentSerializer(qs, many=True).data)

    @extend_schema(request=s.EnrollSerializer, responses={201: s.EnrollmentSerializer})
    @action(detail=True, methods=["post"])
    def enroll(self, request, pk=None):
        student = self._student()
        data = s.EnrollSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        enr = services.enroll(actor=request.user, student=student, **data.validated_data)
        return Response(s.EnrollmentSerializer(enr).data, status=status.HTTP_201_CREATED)

    @extend_schema(request=s.TransferSerializer, responses={200: s.EnrollmentSerializer})
    @action(detail=True, methods=["post"])
    def transfer(self, request, pk=None):
        student = self._student()
        data = s.TransferSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        enr = services.transfer_internal(actor=request.user, student=student, **data.validated_data)
        return Response(s.EnrollmentSerializer(enr).data)

    @extend_schema(request=s.StudentStatusChangeSerializer, responses={200: s.StudentDetailSerializer})
    @action(detail=True, methods=["post"], url_path="status")
    def change_status(self, request, pk=None):
        student = self._student()
        data = s.StudentStatusChangeSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        doc = v.get("document_file")
        if doc is not None:
            files.attach(doc, expected_purposes={"TRANSFER_DOCUMENT"}, owner=request.user)
        services.change_status(
            actor=request.user,
            student=student,
            to_status=v["to_status"],
            effective_date=v.get("effective_date"),
            reason=v["reason"],
            transfer={"destination": v["destination"], "document_file": doc},
        )
        return Response(self._detail(student))

    @extend_schema(methods=["get"], responses={200: s.GuardianLinkSerializer(many=True)})
    @extend_schema(methods=["post"], request=s.GuardianLinkCreateSerializer, responses={201: s.GuardianLinkSerializer})
    @action(detail=True, methods=["get", "post"])
    def guardians(self, request, pk=None):
        student = self._student()
        if request.method == "GET":
            if not (
                user_has_perm(request.user, "guardian.view")
                or getattr(request.user, "guardian_profile", None)
                or getattr(request.user, "student_profile", None)
            ):
                raise DomainError(ErrorCode.PERMISSION_DENIED, "Anda tidak memiliki izin untuk tindakan ini.", status_code=403)
            return Response(s.GuardianLinkSerializer(guardian_links(student), many=True).data)
        if not user_has_perm(request.user, "guardian.update"):
            raise DomainError(ErrorCode.PERMISSION_DENIED, "Anda tidak memiliki izin untuk tindakan ini.", status_code=403)
        data = s.GuardianLinkCreateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        link = services.link_guardian(
            actor=request.user,
            student=student,
            guardian=v.get("guardian_id"),
            guardian_data=v.get("guardian"),
            relationship=v["relationship"],
            is_primary=v["is_primary"],
            receives_notifications=v["receives_notifications"],
            financial_contact=v["financial_contact"],
        )
        return Response(s.GuardianLinkSerializer(link).data, status=status.HTTP_201_CREATED)

    @extend_schema(request=None, responses={204: None})
    @action(detail=True, methods=["delete"], url_path=r"guardians/(?P<link_id>[0-9a-f-]+)")
    def remove_guardian(self, request, pk=None, link_id=None):
        student = self._student()
        link = StudentGuardian.objects.filter(pk=link_id, student=student, active=True).first()
        if link is None:
            raise ScopeDenied()
        services.unlink_guardian(actor=request.user, link=link)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(responses={200: s.StatusHistorySerializer(many=True)})
    @action(detail=True, methods=["get"], url_path="status-history")
    def status_history(self, request, pk=None):
        return Response(s.StatusHistorySerializer(self._student().status_history.select_related("changed_by"), many=True).data)

    @extend_schema(responses={200: s.TransferRecordSerializer(many=True)})
    @action(detail=True, methods=["get"])
    def transfers(self, request, pk=None):
        return Response(s.TransferRecordSerializer(self._student().transfers.all(), many=True).data)

    @extend_schema(responses={200: s.StudentDocumentSerializer(many=True)})
    @action(detail=True, methods=["get"])
    def documents(self, request, pk=None):
        return Response(s.StudentDocumentSerializer(student_documents(request.user, self._student()), many=True).data)

    @extend_schema(responses={(200, "image/svg+xml"): str})
    @action(detail=True, methods=["get"])
    def qr(self, request, pk=None):
        """Digital student card QR (ui.md SCREEN-05/21). Encodes only the student number, never contact data."""
        svg = services.student_card_qr_svg(self._student())
        response = HttpResponse(svg, content_type="image/svg+xml")
        response["Cache-Control"] = "private, max-age=3600"
        return response

    @extend_schema(request=s.PortalAccountSerializer, responses={201: s.StudentDetailSerializer})
    @action(detail=True, methods=["post"], url_path="portal-account")
    def portal_account(self, request, pk=None):
        student = self._student()
        data = s.PortalAccountSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        services.create_portal_account(actor=request.user, profile=student, role_code="STUDENT", **data.validated_data)
        return Response(self._detail(student), status=status.HTTP_201_CREATED)

    @extend_schema(request=s.PhotoSerializer, responses={200: s.StudentDetailSerializer})
    @action(detail=True, methods=["post"])
    def photo(self, request, pk=None):
        student = self._student()
        data = s.PhotoSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        f = files.attach(data.validated_data["file"], expected_purposes={"STUDENT_PHOTO"}, owner=request.user)
        student.photo_file = f
        student.save(update_fields=["photo_file", "updated_at"])
        audit.record(AuditEvent.STUDENT_UPDATED, actor=request.user, resource=student, after={"photo_file": str(f.pk)})
        return Response(self._detail(student))

    @extend_schema(parameters=LIST_PARAMS, responses={(200, "text/csv"): str})
    @action(detail=False, methods=["get"])
    def export(self, request):
        qs = filter_students(
            students_visible_to(request.user).prefetch_related(active_enrollment_prefetch()), request.query_params, request.user
        )
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(
            [
                "student_no",
                "national_student_no",
                "full_name",
                "gender",
                "birth_date",
                "status",
                "academic_year",
                "classroom",
                "grade",
                "major",
            ]
        )
        for st in qs.order_by("full_name"):
            enr = st.active_enrollments[0] if st.active_enrollments else None
            w.writerow(
                [
                    st.student_no,
                    st.national_student_no or "",
                    st.full_name,
                    st.gender,
                    st.birth_date,
                    st.status,
                    enr.academic_year.name if enr else "",
                    enr.classroom.name if enr else "",
                    enr.grade_level.code if enr else "",
                    enr.major.code if enr else "",
                ]
            )
        audit.record(AuditEvent.EXPORT_GENERATED, actor=request.user, resource_type="students", metadata={"rows": qs.count()})
        resp = HttpResponse("﻿" + buf.getvalue(), content_type="text/csv; charset=utf-8")
        resp["Content-Disposition"] = 'attachment; filename="students.csv"'
        return resp


@extend_schema_view(list=extend_schema(parameters=[OpenApiParameter("q", str)]))
@extend_schema(tags=["students"])
class GuardianViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet):
    serializer_class = s.GuardianSerializer
    queryset = Guardian.objects.none()  # schema introspection only
    permission_classes = [ActionPermission]
    required_permissions = {
        "list": "guardian.view",
        "retrieve": "guardian.view",
        "partial_update": "guardian.update",
        "children": None,
        "portal_account": "user.create",
    }
    filter_backends = []
    http_method_names = ["get", "post", "patch"]

    def get_queryset(self):
        qs = Guardian.objects.select_related("user")
        if not user_has_global(self.request.user, "guardian.view"):
            # Homeroom/teacher scope: guardians of visible students only.
            visible = students_visible_to(self.request.user).values("pk")
            qs = qs.filter(student_links__student__in=visible, student_links__active=True).distinct()
        if self.action == "list" and (q := self.request.query_params.get("q", "").strip()):
            qs = qs.filter(Q(full_name__icontains=q) | Q(phone__icontains=q))
        return qs

    def perform_update(self, serializer):
        before = s.GuardianSerializer(serializer.instance).data
        g = serializer.save()
        b, a = audit.diff(dict(before), dict(s.GuardianSerializer(g).data))
        if a:
            audit.record(AuditEvent.STUDENT_UPDATED, actor=self.request.user, resource=g, before=b, after=a)

    @extend_schema(responses={200: s.StudentListSerializer(many=True)})
    @action(detail=True, methods=["get"])
    def children(self, request, pk=None):
        guardian = Guardian.objects.filter(pk=pk).first()
        own = guardian is not None and guardian.user_id == request.user.pk
        if guardian is None or not (own or user_has_perm(request.user, "guardian.view")):
            raise ScopeDenied()
        students = students_visible_to(request.user).filter(guardian_links__guardian=guardian, guardian_links__active=True).distinct()
        return Response(s.StudentListSerializer(students.prefetch_related(active_enrollment_prefetch()), many=True).data)

    @extend_schema(request=s.PortalAccountSerializer, responses={201: s.GuardianSerializer})
    @action(detail=True, methods=["post"], url_path="portal-account")
    def portal_account(self, request, pk=None):
        guardian = self.get_object()
        data = s.PortalAccountSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        services.create_portal_account(actor=request.user, profile=guardian, role_code="GUARDIAN", **data.validated_data)
        guardian.refresh_from_db()
        return Response(s.GuardianSerializer(guardian).data, status=status.HTTP_201_CREATED)


class PortalChildrenView(APIView):
    """Portal child switcher (PRD F4-06): the signed-in student itself, or a guardian's actively linked children."""

    @extend_schema(tags=["students"], responses={200: dict})
    def get(self, request):
        qs = (
            Student.objects.filter(Q(user=request.user) | Q(guardian_links__guardian__user=request.user, guardian_links__active=True))
            .distinct()
            .prefetch_related(active_enrollment_prefetch())
            .order_by("full_name")
        )
        out = []
        for st in qs:
            enr = st.active_enrollments[0] if st.active_enrollments else None
            # Official school contact for the child's class (ui.md SCREEN-22): the homeroom teacher.
            hr = enr.classroom.homeroom_teacher if enr else None
            out.append(
                {
                    "id": str(st.pk),
                    "student_no": st.student_no,
                    "full_name": st.full_name,
                    "status": st.status,
                    "is_self": st.user_id == request.user.pk,
                    "classroom": enr.classroom.name if enr else None,
                    "academic_year": enr.academic_year.name if enr else None,
                    "homeroom_teacher": {"name": hr.full_name, "phone": hr.phone, "email": hr.email} if hr else None,
                }
            )
        return Response(out)

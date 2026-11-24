"""Admissions endpoints: staff workflow (PRD §16.4) and the public applicant portal (F3-05, F3-11)."""

import csv
import io

from django.db.models import Count, Q
from django.http import HttpResponse
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from common.api.authentication import SessionAuthentication
from common.api.crud import MasterDataViewSet
from common.api.exceptions import DomainError, ErrorCode, ScopeDenied
from common.permissions import ActionPermission
from modules.audit import services as audit
from modules.audit.events import AuditEvent
from modules.documents import services as files

from .. import services
from ..models import AdmissionPeriod, Applicant, ApplicantDocument
from . import serializers as s


@extend_schema(tags=["admissions"])
class PeriodViewSet(MasterDataViewSet):
    serializer_class = s.PeriodSerializer
    view_permission = "admission.view"
    manage_permission = "admission.create"
    extra_permissions = {
        "open": "admission.create",
        "close": "admission.create",
        "publish": "admission.decide",
        "complete": "admission.create",
        "statistics": "admission.view",
    }
    filter_backends = []
    pagination_class = None

    def get_queryset(self):
        return AdmissionPeriod.objects.select_related("academic_year").annotate(applicant_count=Count("applicants"))

    def _transition(self, request, action_name):
        period = services.period_transition(actor=request.user, period=self.get_object(), action=action_name)
        return Response(s.PeriodSerializer(self.get_queryset().get(pk=period.pk)).data)

    @extend_schema(request=None, responses={200: s.PeriodSerializer})
    @action(detail=True, methods=["post"])
    def open(self, request, pk=None):
        return self._transition(request, "open")

    @extend_schema(request=None, responses={200: s.PeriodSerializer})
    @action(detail=True, methods=["post"])
    def close(self, request, pk=None):
        return self._transition(request, "close")

    @extend_schema(request=None, responses={200: s.PeriodSerializer})
    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        return self._transition(request, "publish")

    @extend_schema(request=None, responses={200: s.PeriodSerializer})
    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        return self._transition(request, "complete")

    @extend_schema(responses={200: dict})
    @action(detail=True, methods=["get"])
    def statistics(self, request, pk=None):
        period = self.get_object()
        apps = period.applicants.all()
        by_status = dict(apps.values_list("status").annotate(n=Count("id")))
        by_major = {k or "—": v for k, v in apps.values_list("desired_major__code").annotate(n=Count("id"))}
        by_gender = {k or "—": v for k, v in apps.values_list("gender").annotate(n=Count("id"))}
        return Response(
            {
                "total": apps.count(),
                "capacity_total": period.capacity_total,
                "by_status": by_status,
                "by_major": by_major,
                "by_gender": by_gender,
            }
        )


APPLICANT_PARAMS = [OpenApiParameter(p, str) for p in ("admission_period_id", "status", "q", "desired_major_id", "ordering")]


@extend_schema_view(list=extend_schema(parameters=APPLICANT_PARAMS))
@extend_schema(tags=["admissions"])
class ApplicantViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    permission_classes = [ActionPermission]
    required_permissions = {
        "list": "admission.view",
        "retrieve": "admission.view",
        "create": "admission.create",
        "partial_update": "admission.create",
        "attach_document": "admission.create",
        "verify_document": "admission.verify",
        "submit": "admission.create",
        "verify": "admission.verify",
        "eligible": "admission.verify",
        "decision": "admission.decide",
        "re_register": "admission.enroll",
        "enroll": "admission.enroll",
        "export": "admission.view",
    }
    filter_backends = []
    http_method_names = ["get", "post", "patch"]

    def get_queryset(self):
        qs = Applicant.objects.select_related("admission_period__academic_year", "desired_major", "decision", "student")
        if self.action in {"list", "export"}:
            p = self.request.query_params
            if v := p.get("admission_period_id"):
                qs = qs.filter(admission_period_id=v)
            if v := p.get("status"):
                qs = qs.filter(status__in=v.split(","))
            if v := p.get("desired_major_id"):
                qs = qs.filter(desired_major_id=v)
            if v := p.get("q", "").strip():
                qs = qs.filter(Q(full_name__icontains=v) | Q(registration_no__icontains=v) | Q(previous_school__icontains=v))
            if p.get("ordering") == "rank":
                return qs.order_by("decision__rank", "-decision__score", "full_name")
        return qs.order_by("-created_at")

    def get_serializer_class(self):
        return s.ApplicantListSerializer if self.action == "list" else s.ApplicantDetailSerializer

    def _detail(self, applicant):
        return s.ApplicantDetailSerializer(self.get_queryset().get(pk=applicant.pk)).data

    @extend_schema(request=s.ApplicantCreateSerializer, responses={201: s.ApplicantDetailSerializer})
    def create(self, request):
        data = s.ApplicantCreateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v = dict(data.validated_data)
        period, guardians = v.pop("admission_period"), v.pop("guardians", [])
        applicant, _ = services.create_applicant(actor=request.user, period=period, data=v, guardians=guardians)
        return Response(self._detail(applicant), status=status.HTTP_201_CREATED)

    @extend_schema(request=s.ApplicantWriteSerializer, responses={200: s.ApplicantDetailSerializer})
    def partial_update(self, request, pk=None):
        data = s.ApplicantWriteSerializer(data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        v = dict(data.validated_data)
        guardians = v.pop("guardians", None)
        applicant = services.update_applicant(actor=request.user, applicant=self.get_object(), data=v, guardians=guardians)
        return Response(self._detail(applicant))

    @extend_schema(request=s.DocumentAttachSerializer, responses={201: s.ApplicantDetailSerializer})
    @action(detail=True, methods=["post"], url_path="documents")
    def attach_document(self, request, pk=None):
        data = s.DocumentAttachSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        services.add_document(actor=request.user, applicant=self.get_object(), **data.validated_data)
        return Response(self._detail(self.get_object()), status=status.HTTP_201_CREATED)

    @extend_schema(request=s.DocumentVerifySerializer, responses={200: s.ApplicantDetailSerializer})
    @action(detail=True, methods=["post"], url_path=r"documents/(?P<doc_id>[0-9a-f-]+)/verify")
    def verify_document(self, request, pk=None, doc_id=None):
        applicant = self.get_object()
        doc = ApplicantDocument.objects.filter(pk=doc_id, applicant=applicant, active=True).first()
        if doc is None:
            raise ScopeDenied()
        data = s.DocumentVerifySerializer(data=request.data)
        data.is_valid(raise_exception=True)
        services.verify_document(
            actor=request.user, document=doc, status=data.validated_data["verification_status"], note=data.validated_data["note"]
        )
        return Response(self._detail(applicant))

    @extend_schema(request=None, responses={200: s.ApplicantDetailSerializer})
    @action(detail=True, methods=["post"])
    def submit(self, request, pk=None):
        return Response(self._detail(services.submit(actor=request.user, applicant=self.get_object())))

    @extend_schema(request=s.NoteSerializer, responses={200: s.ApplicantDetailSerializer})
    @action(detail=True, methods=["post"])
    def verify(self, request, pk=None):
        data = s.NoteSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        return Response(self._detail(services.verify(actor=request.user, applicant=self.get_object(), note=data.validated_data["note"])))

    @extend_schema(request=s.NoteSerializer, responses={200: s.ApplicantDetailSerializer})
    @action(detail=True, methods=["post"])
    def eligible(self, request, pk=None):
        data = s.NoteSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        return Response(
            self._detail(services.mark_eligible(actor=request.user, applicant=self.get_object(), note=data.validated_data["note"]))
        )

    @extend_schema(request=s.DecisionInputSerializer, responses={200: s.ApplicantDetailSerializer})
    @action(detail=True, methods=["post"])
    def decision(self, request, pk=None):
        data = s.DecisionInputSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        return Response(self._detail(services.decide(actor=request.user, applicant=self.get_object(), **data.validated_data)))

    @extend_schema(request=None, responses={200: s.ApplicantDetailSerializer})
    @action(detail=True, methods=["post"], url_path="re-register")
    def re_register(self, request, pk=None):
        return Response(self._detail(services.re_register(actor=request.user, applicant=self.get_object())))

    @extend_schema(request=s.EnrollInputSerializer, responses={201: s.ApplicantDetailSerializer})
    @action(detail=True, methods=["post"])
    def enroll(self, request, pk=None):
        data = s.EnrollInputSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        _, created = services.enroll(actor=request.user, applicant=self.get_object(), **data.validated_data)
        return Response(self._detail(self.get_object()), status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    @extend_schema(parameters=APPLICANT_PARAMS, responses={(200, "text/csv"): str})
    @action(detail=False, methods=["get"])
    def export(self, request):
        qs = self.get_queryset()
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(
            [
                "registration_no",
                "full_name",
                "birth_date",
                "gender",
                "previous_school",
                "desired_major",
                "status",
                "score",
                "rank",
                "submitted_at",
            ]
        )
        for a in qs:
            dec = getattr(a, "decision", None)
            w.writerow(
                [
                    a.registration_no,
                    a.full_name,
                    a.birth_date,
                    a.gender,
                    a.previous_school,
                    a.desired_major.code if a.desired_major else "",
                    a.status,
                    dec.score if dec else "",
                    dec.rank if dec else "",
                    a.submitted_at or "",
                ]
            )
        audit.record(AuditEvent.EXPORT_GENERATED, actor=request.user, resource_type="admissions.applicant", metadata={"rows": qs.count()})
        resp = HttpResponse("﻿" + buf.getvalue(), content_type="text/csv; charset=utf-8")
        resp["Content-Disposition"] = 'attachment; filename="applicants.csv"'
        return resp


# ---------------------------------------------------------------- public portal (no login)


class _Public(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "public_form"

    def csrf(self, request):
        SessionAuthentication().enforce_csrf(request)

    def applicant(self, request, registration_no):
        token = request.headers.get("X-Applicant-Token", "")
        a = Applicant.objects.select_related("admission_period__academic_year").filter(registration_no=registration_no.upper()).first()
        if a is None or not services.check_token(a, token):
            raise ScopeDenied("Pendaftaran tidak ditemukan.")
        return a


class PublicPeriodsView(_Public):
    @extend_schema(tags=["admissions-public"], responses={200: s.PublicPeriodSerializer(many=True)})
    def get(self, request):
        now = timezone.now()
        qs = AdmissionPeriod.objects.select_related("academic_year").filter(
            status=AdmissionPeriod.Status.OPEN, registration_start__lte=now, registration_end__gte=now
        )
        return Response(s.PublicPeriodSerializer(qs, many=True).data)


class PublicApplicantCreateView(_Public):
    @extend_schema(tags=["admissions-public"], request=s.ApplicantCreateSerializer, responses={201: s.PublicCreatedSerializer})
    def post(self, request):
        self.csrf(request)
        data = s.ApplicantCreateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v = dict(data.validated_data)
        period, guardians = v.pop("admission_period"), v.pop("guardians", [])
        applicant, token = services.create_applicant(actor=None, period=period, data=v, guardians=guardians, public=True)
        return Response(
            {"registration_no": applicant.registration_no, "access_token": token, "applicant": s.ApplicantDetailSerializer(applicant).data},
            status=status.HTTP_201_CREATED,
        )


class PublicApplicantView(_Public):
    @extend_schema(tags=["admissions-public"], responses={200: s.ApplicantDetailSerializer})
    def get(self, request, registration_no):
        return Response(s.ApplicantDetailSerializer(self.applicant(request, registration_no)).data)

    @extend_schema(tags=["admissions-public"], request=s.ApplicantWriteSerializer, responses={200: s.ApplicantDetailSerializer})
    def patch(self, request, registration_no):
        self.csrf(request)
        a = self.applicant(request, registration_no)
        data = s.ApplicantWriteSerializer(data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        v = dict(data.validated_data)
        guardians = v.pop("guardians", None)
        a = services.update_applicant(actor=None, applicant=a, data=v, guardians=guardians, public=True)
        return Response(s.ApplicantDetailSerializer(a).data)


class PublicDocumentView(_Public):
    @extend_schema(
        tags=["admissions-public"],
        request={"multipart/form-data": s.PublicDocumentUploadSerializer},
        responses={201: s.ApplicantDetailSerializer},
    )
    def post(self, request, registration_no):
        self.csrf(request)
        a = self.applicant(request, registration_no)
        data = s.PublicDocumentUploadSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        stored = files.store_upload(data.validated_data["file"], purpose="ADMISSION_DOCUMENT")
        services.add_document(actor=None, applicant=a, document_type=data.validated_data["document_type"], file=stored, public=True)
        return Response(s.ApplicantDetailSerializer(Applicant.objects.get(pk=a.pk)).data, status=status.HTTP_201_CREATED)


class PublicSubmitView(_Public):
    @extend_schema(tags=["admissions-public"], request=None, responses={200: s.ApplicantDetailSerializer})
    def post(self, request, registration_no):
        self.csrf(request)
        a = services.submit(actor=None, applicant=self.applicant(request, registration_no), public=True)
        return Response(s.ApplicantDetailSerializer(a).data)


class PublicStatusView(_Public):
    @extend_schema(tags=["admissions-public"], request=s.StatusLookupSerializer, responses={200: dict})
    def post(self, request):
        self.csrf(request)
        data = s.StatusLookupSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        result = services.public_status(**data.validated_data)
        if result is None:
            raise DomainError(
                ErrorCode.RESOURCE_NOT_FOUND, "Data pendaftaran tidak ditemukan. Periksa nomor dan tanggal lahir.", status_code=404
            )
        return Response(result)


class PublicRecoverView(_Public):
    @extend_schema(tags=["admissions-public"], request=s.RecoverSerializer, responses={200: dict})
    def post(self, request):
        self.csrf(request)
        data = s.RecoverSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        reg = services.recover_registration_no(**data.validated_data)
        if reg is None:
            raise DomainError(ErrorCode.RESOURCE_NOT_FOUND, "Data tidak cocok. Hubungi petugas pendaftaran.", status_code=404)
        return Response({"registration_no": reg})

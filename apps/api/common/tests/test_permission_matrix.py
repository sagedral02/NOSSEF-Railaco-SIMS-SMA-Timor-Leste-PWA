"""F14-11 permission matrix: every API route denies anonymous access except an explicit public allowlist, and portal
roles cannot reach staff-only collections."""

import re
import uuid

import pytest
from django.urls import URLPattern, URLResolver, get_resolver
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db

PUBLIC = re.compile(
    r"^/api/v1/(health/|auth/(csrf|login|password-reset)|admissions/public/|report-cards/verify/|schema/|docs/)"
)


def _routes(resolver=None, prefix=""):
    resolver = resolver or get_resolver()
    for p in resolver.url_patterns:
        route = prefix + str(p.pattern)
        if isinstance(p, URLResolver):
            yield from _routes(p, route)
        elif isinstance(p, URLPattern):
            yield route


def _concrete(route):
    path = "/" + route.lstrip("^").rstrip("$")
    path = re.sub(r"<uuid:[^>]+>|<str:[^>]+>|<int:[^>]+>|<[^>]+>|\(\?P<[^>]+>[^)]+\)", str(uuid.uuid4()), path)
    return path.replace("\\.", ".").replace("\\", "")


def api_paths():
    seen = set()
    for r in _routes():
        p = _concrete(r)
        if p.startswith("/api/v1/") and "(?" not in p and "format" not in p and p not in seen:
            seen.add(p)
            yield p


def test_anonymous_is_denied_everywhere_except_public_allowlist():
    client = APIClient()
    leaks = []
    for path in api_paths():
        if PUBLIC.match(path):
            continue
        r = client.get(path)
        if r.status_code not in (401, 403, 404, 405):
            leaks.append((path, r.status_code))
    assert not leaks, leaks


STAFF_ONLY = [
    "/api/v1/students/", "/api/v1/finance/invoices/generate-preview/", "/api/v1/finance/reports/summary/", "/api/v1/counseling/cases/",
    "/api/v1/users/", "/api/v1/audit-logs/", "/api/v1/attendance/class-report/", "/api/v1/grades/completion/", "/api/v1/assets/",
    "/api/v1/discipline/incidents/", "/api/v1/announcements/", "/api/v1/admissions/applicants/",
]


@pytest.mark.parametrize("role", ["STUDENT", "GUARDIAN"])
def test_portal_roles_cannot_list_staff_collections(make_user, role):
    api = APIClient()
    api.force_authenticate(make_user(f"p-{role.lower()}", roles=[role]))
    for path in STAFF_ONLY:
        r = api.get(path)
        assert r.status_code in (403, 404, 405) or (r.status_code == 200 and r.json()["data"] == []), (path, r.status_code)

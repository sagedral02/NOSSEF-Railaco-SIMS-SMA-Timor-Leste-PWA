"""Pagination (PRD §11.3): default 25, max 100; cursor for feeds, page-number for master data."""

from urllib.parse import parse_qs, urlparse

from rest_framework.pagination import CursorPagination, PageNumberPagination
from rest_framework.response import Response

from common.api.renderers import Enveloped


class StandardPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 100

    def get_paginated_response(self, data):
        page = self.page
        return Response(
            Enveloped(
                {
                    "data": data,
                    "meta": {
                        "count": page.paginator.count,
                        "page": page.number,
                        "page_size": page.paginator.per_page,
                        "total_pages": page.paginator.num_pages,
                    },
                }
            )
        )

    def get_paginated_response_schema(self, schema):
        return {
            "type": "object",
            "properties": {
                "data": schema,
                "meta": {
                    "type": "object",
                    "properties": {
                        "count": {"type": "integer"},
                        "page": {"type": "integer"},
                        "page_size": {"type": "integer"},
                        "total_pages": {"type": "integer"},
                        "request_id": {"type": "string"},
                    },
                },
            },
        }


def _cursor_of(link):
    if not link:
        return None
    values = parse_qs(urlparse(link).query).get("cursor")
    return values[0] if values else None


class FeedCursorPagination(CursorPagination):
    """Cursor pagination for audit/activity/notification feeds."""

    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 100
    ordering = ("-created_at", "-id")

    def get_paginated_response(self, data):
        return Response(
            Enveloped(
                {
                    "data": data,
                    "meta": {
                        "next_cursor": _cursor_of(self.get_next_link()),
                        "previous_cursor": _cursor_of(self.get_previous_link()),
                        "count": None,
                    },
                }
            )
        )

    def get_paginated_response_schema(self, schema):
        return {
            "type": "object",
            "properties": {
                "data": schema,
                "meta": {
                    "type": "object",
                    "properties": {
                        "next_cursor": {"type": "string", "nullable": True},
                        "previous_cursor": {"type": "string", "nullable": True},
                        "request_id": {"type": "string"},
                    },
                },
            },
        }

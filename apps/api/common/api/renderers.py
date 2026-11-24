"""Success envelope renderer (PRD §46.2): {"data": ..., "meta": {...}}."""

from rest_framework.renderers import JSONRenderer

from common.context import current_request_id


class Enveloped(dict):
    """Marks a payload that is already in envelope form (pagination, errors)."""


class EnvelopeJSONRenderer(JSONRenderer):
    def render(self, data, accepted_media_type=None, renderer_context=None):
        response = (renderer_context or {}).get("response")
        if response is not None and response.status_code == 204:
            return b""
        if isinstance(data, Enveloped):
            payload = dict(data)
        else:
            payload = {"data": data}
        meta = dict(payload.get("meta") or {})
        meta.setdefault("request_id", current_request_id())
        payload["meta"] = meta
        return super().render(payload, accepted_media_type, renderer_context)

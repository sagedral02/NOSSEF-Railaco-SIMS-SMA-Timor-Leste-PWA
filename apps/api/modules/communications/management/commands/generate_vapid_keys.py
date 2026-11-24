"""Print a VAPID key pair for Web Push (.env: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY, ENABLE_WEB_PUSH=true)."""

import base64

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Generate a VAPID key pair for Web Push"

    def handle(self, *args, **options):
        key = ec.generate_private_key(ec.SECP256R1())
        priv = key.private_numbers().private_value.to_bytes(32, "big")
        pub = key.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
        b64 = lambda b: base64.urlsafe_b64encode(b).rstrip(b"=").decode()  # noqa: E731
        self.stdout.write(f"VAPID_PUBLIC_KEY={b64(pub)}\nVAPID_PRIVATE_KEY={b64(priv)}")

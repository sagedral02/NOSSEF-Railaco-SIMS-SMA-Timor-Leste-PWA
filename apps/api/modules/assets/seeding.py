"""Synthetic asset demo data (local only)."""

from datetime import date
from decimal import Decimal

from django.db import transaction

ITEMS = [
    ("Laptop Lenovo ThinkPad", "TIK", "650.00"),
    ("Proyektor Epson", "TIK", "420.00"),
    ("Printer Canon", "TIK", "180.00"),
    ("Mikroskop Binokular", "Laboratorium", "310.00"),
    ("Meja Guru", "Mebel", "75.00"),
    ("Lemari Arsip", "Mebel", "120.00"),
    ("Genset 5kVA", "Listrik", "900.00"),
    ("Bola Futsal (set)", "Olahraga", "60.00"),
]


@transaction.atomic
def seed_demo_assets():
    from common.seeding import assert_demo_allowed
    from modules.academics.models import Room
    from modules.accounts.models import User
    from modules.staff.models import StaffProfile, Teacher

    from . import services
    from .models import Asset

    assert_demo_allowed()
    if Asset.objects.exists():
        return {"skipped": True}
    actor = User.objects.get(username="patrimoniu")
    rooms = list(Room.objects.order_by("code")[:6])
    teachers = list(Teacher.objects.filter(employment_status="ACTIVE").order_by("full_name")[:6])
    staff = list(StaffProfile.objects.order_by("full_name")[:2])
    n = 0
    for i, (name, cat, cost) in enumerate(ITEMS):
        for j in range(3):
            n += 1
            a = Asset.objects.create(
                asset_no=f"NOS-{cat[:3].upper()}-{n:04d}",
                name=name,
                category=cat,
                serial_no=f"SN{2026000 + n}",
                purchase_date=date(2023 + j % 3, 1 + i % 12, 10),
                purchase_cost=Decimal(cost),
                location_room=rooms[(i + j) % len(rooms)] if rooms else None,
            )
            if j == 0 and teachers:
                services.assign(actor=actor, asset=a, target_type="TEACHER", teacher=teachers[i % len(teachers)])
            elif j == 1 and rooms and cat in {"TIK", "Laboratorium", "Mebel"}:
                services.assign(actor=actor, asset=a, target_type="ROOM", room=rooms[i % len(rooms)])
            elif j == 2 and i % 3 == 0:
                services.start_maintenance(actor=actor, asset=a, description="Perawatan berkala (demo)", vendor="Loja Dili")
    if staff:
        extra = Asset.objects.create(asset_no="NOS-ADM-0100", name="Komputer Tata Usaha", category="TIK", purchase_cost=Decimal("540.00"))
        services.assign(actor=actor, asset=extra, target_type="STAFF", staff=staff[0])
    old = Asset.objects.create(asset_no="NOS-TIK-0999", name="Komputer lama", category="TIK", condition="DAMAGED")
    services.retire(actor=actor, asset=old, reason="Rusak total, dihapusbukukan (demo)")
    return {"assets": Asset.objects.count()}

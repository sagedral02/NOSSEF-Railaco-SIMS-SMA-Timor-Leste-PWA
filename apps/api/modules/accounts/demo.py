"""Synthetic demo accounts for local development only (PRD §53.2 seed_demo_school)."""

import os

from django.db import transaction

from .models import AccountStatus, Role, User, UserRole

DEMO_USERS = [
    ("admin", "Administrador Sistema", ["SUPER_ADMIN"]),
    ("sekretaria", "Sekretaria Eskola", ["SCHOOL_ADMIN"]),
    ("cristina.amaral", "Cristina Amaral", ["PRINCIPAL"]),
    ("maria.martins", "Maria Gorete Martins", ["CURRICULUM_ADMIN"]),
    ("antonio.soares", "António Soares", ["TEACHER", "HOMEROOM_TEACHER"]),
    ("agostinho.freitas", "Agostinho Freitas", ["TEACHER"]),
    ("finansas", "Tesoureiro Eskola", ["FINANCE_ADMIN"]),
    ("admisaun", "Ofisiál Admisaun", ["ADMISSION_OFFICER"]),
    ("konselora", "Konselora BK", ["COUNSELOR"]),
    ("biblioteka", "Bibliotekáriu", ["LIBRARIAN"]),
    ("patrimoniu", "Ofisiál Patrimóniu", ["ASSET_OFFICER"]),
    ("estudante", "Estudante Demo", ["STUDENT"]),
    ("inan-aman", "Inan-Aman Demo", ["GUARDIAN"]),
]


@transaction.atomic
def seed_demo_users():
    password = os.environ.get("DEMO_PASSWORD", "nossef2026")
    roles = {r.code: r for r in Role.objects.all()}
    created = 0
    for username, full_name, role_codes in DEMO_USERS:
        user = User.objects.filter(username=username).first()
        if user is None:
            user = User.objects.create_user(
                username,
                password,
                full_name=full_name,
                account_status=AccountStatus.ACTIVE,
                is_staff=username == "admin",
            )
            created += 1
        for code in role_codes:
            UserRole.objects.get_or_create(user=user, role=roles[code], revoked_at=None)
    return {"users_created": created, "password": "DEMO_PASSWORD env (default nossef2026)"}

"""Synthetic students/guardians for local demo (PRD §53.2). Names are generated, not real people."""

import random
from datetime import date

from django.db import transaction

from modules.academics.models import AcademicYear, ClassRoom

from .models import EnrollmentSource, Guardian, Relationship, Student, StudentEnrollment, StudentGuardian, StudentStatusHistory

FIRST_M = [
    "João",
    "António",
    "Manuel",
    "Francisco",
    "José",
    "Domingos",
    "Mateus",
    "Agostinho",
    "Paulo",
    "Aleixo",
    "Celestino",
    "Hermenegildo",
    "Lourenço",
    "Marcelino",
    "Natalino",
    "Oscar",
    "Remígio",
    "Silvino",
    "Tomás",
    "Venâncio",
    "Zeferino",
    "Abílio",
    "Bernardino",
    "Cipriano",
    "Delfim",
    "Eusébio",
    "Fernando",
    "Gaspar",
    "Inácio",
    "Jacinto",
]
FIRST_F = [
    "Maria",
    "Ana",
    "Joana",
    "Teresa",
    "Rosa",
    "Fátima",
    "Lúcia",
    "Natália",
    "Sabina",
    "Filomena",
    "Graciana",
    "Helena",
    "Imaculada",
    "Juliana",
    "Leopoldina",
    "Madalena",
    "Olinda",
    "Perpétua",
    "Regina",
    "Santina",
    "Vitória",
    "Zulmira",
    "Albertina",
    "Bendita",
    "Carolina",
    "Delfina",
    "Ermelinda",
    "Floriana",
    "Germana",
    "Isabel",
]
LAST = [
    "da Costa",
    "Soares",
    "Pereira",
    "Martins",
    "Guterres",
    "Ximenes",
    "Belo",
    "Gusmão",
    "Amaral",
    "dos Santos",
    "Freitas",
    "Lopes",
    "Mendonça",
    "Sarmento",
    "Araújo",
    "Fernandes",
    "Carvalho",
    "Pinto",
    "Tilman",
    "Lobato",
    "Alves",
    "Barreto",
    "de Jesus",
    "Gomes",
    "Hornai",
    "Mau",
    "Leki",
    "Siqueira",
    "Correia",
    "do Rosário",
]
JOBS = ["Agrikultor", "Komersiante", "Funsionáriu Públiku", "Profesór", "Enfermeiru", "Kafé-Produtór", "Motorista", "Doméstika"]
SIZES = {
    "X-IPA-1": 26,
    "X-IPA-2": 25,
    "X-IPS-1": 24,
    "X-IPS-2": 23,
    "XI-IPA-1": 25,
    "XI-IPA-2": 24,
    "XI-IPS-1": 23,
    "XII-IPA-1": 22,
    "XII-IPS-1": 21,
}


def random_name(rng, gender):
    first = rng.choice(FIRST_F if gender == "F" else FIRST_M)
    middle = f" {rng.choice(FIRST_F if gender == 'F' else FIRST_M)}" if rng.random() < 0.4 else ""
    return f"{first}{middle} {rng.choice(LAST)}"


@transaction.atomic
def seed_demo_students():
    from modules.accounts.models import User

    year = AcademicYear.objects.filter(name="2026").first()
    if year is None or StudentEnrollment.objects.filter(academic_year=year).exists():
        return {"skipped": True}
    rng = random.Random(2026)
    seq = 0
    created = 0
    first_student = None
    shared_guardian = None
    for cls in ClassRoom.objects.filter(academic_year=year).select_related("grade_level", "major").order_by("code"):
        entry_year = 2026 - (cls.grade_level.sequence - 10)
        for _ in range(SIZES.get(cls.code, 20)):
            seq += 1
            gender = "F" if rng.random() < 0.52 else "M"
            name = random_name(rng, gender)
            birth_year = 2026 - (cls.grade_level.sequence + 6) - rng.randint(0, 1)
            st = Student.objects.create(
                student_no=f"NOS-{entry_year}-{seq:04d}",
                national_student_no=f"EMIS-TL-{rng.randint(100000, 999999)}{seq:03d}",
                full_name=name,
                gender=gender,
                birth_place=rng.choice(["Railaco", "Ermera", "Gleno", "Díli", "Liquiçá"]),
                birth_date=date(birth_year, rng.randint(1, 12), rng.randint(1, 28)),
                address=f"Aldeia {rng.choice(['Railaco Kraik', 'Taraco', 'Tokoluli', 'Samalete', 'Liho'])}, Railaco, Ermera",
                phone=f"+670 77{rng.randint(10, 99)} {rng.randint(1000, 9999)}",
                admission_date=date(entry_year, 1, 19),
            )
            StudentStatusHistory.objects.create(student=st, to_status="ACTIVE", effective_date=st.admission_date, reason="Demo")
            StudentEnrollment.objects.create(
                student=st,
                academic_year=year,
                grade_level=cls.grade_level,
                major=cls.major,
                classroom=cls,
                start_date=year.start_date,
                source=EnrollmentSource.ADMISSION if entry_year == 2026 else EnrollmentSource.PROMOTION,
            )
            last = name.split(" ", 1)[1] if " " in name else name
            if seq == 2 and shared_guardian is not None:
                g = shared_guardian  # one demo guardian with two children (child switcher)
            else:
                g = Guardian.objects.create(
                    full_name=f"{rng.choice(FIRST_M if rng.random() < 0.5 else FIRST_F)} {last}",
                    phone=f"+670 77{rng.randint(10, 99)} {rng.randint(1000, 9999)}",
                    occupation=rng.choice(JOBS),
                    address=st.address,
                )
            StudentGuardian.objects.create(
                student=st,
                guardian=g,
                relationship=rng.choice([Relationship.FATHER, Relationship.MOTHER]),
                is_primary=True,
                financial_contact=True,
            )
            if seq == 1:
                first_student, shared_guardian = st, g
            created += 1
    # Link the demo portal accounts: `estudante` → first student, `inan-aman` → guardian of the first two students.
    users = {u.username: u for u in User.objects.filter(username__in=["estudante", "inan-aman"])}
    if first_student and "estudante" in users:
        first_student.user = users["estudante"]
        first_student.save(update_fields=["user"])
    if shared_guardian and "inan-aman" in users:
        shared_guardian.user = users["inan-aman"]
        shared_guardian.save(update_fields=["user"])
    return {"students": created}

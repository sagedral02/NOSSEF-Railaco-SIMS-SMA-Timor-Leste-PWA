"""Reference seeds (PRD §53.1) and synthetic demo academic configuration (local only)."""

from datetime import date, datetime, time, timedelta

from django.db import transaction
from django.utils import timezone

from .models import AcademicYear, BellPeriod, ClassRoom, GradeLevel, Major, Room, SchoolCalendarEvent, Subject, SubjectOffering, Trimester

GRADES = [("X", 10), ("XI", 11), ("XII", 12)]
# ADR-007: stable codes IPA/IPS; display names carry NOSSEF's local stream labels.
MAJORS = [("IPA", "IPA — Ciências e Tecnologias (CT)"), ("IPS", "IPS — Ciências Sociais e Humanidades (CSH)")]


@transaction.atomic
def seed_academic_reference():
    created = 0
    for code, seq in GRADES:
        _, c = GradeLevel.objects.get_or_create(code=code, defaults={"sequence": seq})
        created += c
    for code, name in MAJORS:
        _, c = Major.objects.get_or_create(code=code, defaults={"name": name})
        created += c
    return {"created": created}


SUBJECTS = [
    ("TET", "Tétum", "CORE", None, 3),
    ("POR", "Português", "CORE", None, 4),
    ("ING", "Inglês", "CORE", None, 3),
    ("IND", "Bahasa Indonesia", "CORE", None, 2),
    ("MAT", "Matemática", "CORE", None, 5),
    ("REL", "Religião e Moral", "CORE", None, 2),
    ("CID", "Cidadania e Desenvolvimento Social", "CORE", None, 2),
    ("EDF", "Educação Física e Desporto", "CORE", None, 2),
    ("TIC", "Tecnologias de Informação e Comunicação", "CORE", None, 2),
    ("FIS", "Física", "MAJOR", "IPA", 4),
    ("QUI", "Química", "MAJOR", "IPA", 4),
    ("BIO", "Biologia", "MAJOR", "IPA", 4),
    ("GEO", "Geologia", "MAJOR", "IPA", 2),
    ("HIS", "História", "MAJOR", "IPS", 4),
    ("GEG", "Geografia", "MAJOR", "IPS", 4),
    ("ECO", "Economia", "MAJOR", "IPS", 4),
    ("SOC", "Sociologia", "MAJOR", "IPS", 3),
]
TEACHERS = [
    ("NIP-198001", "Cristina Amaral", "F", ["REL"], "cristina.amaral"),
    ("NIP-198002", "Maria Gorete Martins", "F", ["POR"], "maria.martins"),
    ("NIP-198003", "António da Costa Soares", "M", ["FIS", "MAT"], "antonio.soares"),
    ("NIP-198004", "Domingos Ximenes", "M", ["MAT"], None),
    ("EMP-005", "Lúcia Guterres", "F", ["BIO", "GEO"], None),
    ("NIP-198006", "Mateus Pereira", "M", ["QUI"], None),
    ("EMP-007", "Teresa Belo", "F", ["POR"], None),
    ("EMP-008", "Agostinho Freitas", "M", ["ING"], "agostinho.freitas"),
    ("NIP-198009", "Rosa Mendonça", "F", ["HIS", "CID"], None),
    ("EMP-010", "Paulo Sarmento", "M", ["GEG"], None),
    ("NIP-198011", "Natália Araújo", "F", ["ECO", "SOC"], None),
    ("EMP-012", "Celestino Lopes", "M", ["EDF"], None),
    ("EMP-013", "Filomena Gusmão", "F", ["TET"], None),
    ("EMP-014", "Manuel Fernandes", "M", ["TIC"], None),
    ("EMP-015", "Helena dos Santos", "F", ["IND"], None),
    ("NIP-198017", "Venâncio Tilman", "M", ["MAT", "TIC"], None),
    ("EMP-018", "Graciana Lobato", "F", ["SOC", "CID"], None),
    ("NIP-198019", "Bernardino Alves", "M", ["FIS"], None),
    ("EMP-020", "Madalena Barreto", "F", ["ING", "TET"], None),
]
STAFF = [
    ("STF-001", "Imaculada Hornai", "Sekretaria da Escola", "Administrasaun", "sekretaria"),
    ("STF-002", "Lourenço Correia", "Tesoureiro", "Finansas", "finansas"),
    ("STF-003", "Albertina Leki", "Bibliotekária", "Biblioteka", "biblioteka"),
    ("STF-004", "Gaspar Siqueira", "Ofisiál Patrimóniu", "Logístika", "patrimoniu"),
    ("STF-005", "Perpétua do Rosário", "Konselora BK", "Konsellu", "konselora"),
    ("STF-006", "Natalino Mau", "Ofisiál Admisaun", "Administrasaun", "admisaun"),
]
# (code, name, grade, major, homeroom employee_no, room)
CLASSES = [
    ("X-IPA-1", "X IPA 1 (10º CT-A)", "X", "IPA", "NIP-198003", "R-101"),
    ("X-IPA-2", "X IPA 2 (10º CT-B)", "X", "IPA", "NIP-198019", "R-102"),
    ("X-IPS-1", "X IPS 1 (10º CSH-A)", "X", "IPS", "NIP-198009", "R-103"),
    ("X-IPS-2", "X IPS 2 (10º CSH-B)", "X", "IPS", "EMP-013", "R-104"),
    ("XI-IPA-1", "XI IPA 1 (11º CT-A)", "XI", "IPA", "EMP-005", "R-105"),
    ("XI-IPA-2", "XI IPA 2 (11º CT-B)", "XI", "IPA", "NIP-198006", "R-106"),
    ("XI-IPS-1", "XI IPS 1 (11º CSH)", "XI", "IPS", "NIP-198011", "R-107"),
    ("XII-IPA-1", "XII IPA 1 (12º CT)", "XII", "IPA", "NIP-198004", "R-108"),
    ("XII-IPS-1", "XII IPS 1 (12º CSH)", "XII", "IPS", "EMP-010", "R-109"),
]
BELLS = [
    ("07:30", "08:15"),
    ("08:15", "09:00"),
    ("09:00", "09:45"),
    ("10:05", "10:50"),
    ("10:50", "11:35"),
    ("11:35", "12:20"),
    ("12:20", "13:05"),
]


def _t(s):
    return time.fromisoformat(s)


@transaction.atomic
def seed_demo_academics():
    from modules.accounts.models import User
    from modules.staff.models import StaffProfile, Teacher

    from . import services
    from .models import TeachingAssignment

    if AcademicYear.objects.filter(name="2026").exists():
        return {"skipped": "academic year 2026 exists"}
    seed_academic_reference()
    users = {u.username: u for u in User.objects.all()}
    teachers = {}
    for emp, name, gender, _, username in TEACHERS:
        teachers[emp] = Teacher.objects.create(
            employee_no=emp,
            full_name=name,
            gender=gender,
            user=users.get(username) if username else None,
            email=f"{name.split()[0].lower()}@nossef.example",
            join_date=date(2015, 1, 5),
        )
    for emp, name, pos, dept, username in STAFF:
        StaffProfile.objects.create(employee_no=emp, full_name=name, position=pos, department=dept, user=users.get(username))
    rooms = {}
    for i in range(9):
        rooms[f"R-{101 + i}"] = Room.objects.create(code=f"R-{101 + i}", name=f"Sala {101 + i}", capacity=36)
    for code, name, rtype in [
        ("LAB-FIS", "Laboratóriu Fízika", "LAB"),
        ("LAB-KIM", "Laboratóriu Kímika", "LAB"),
        ("LAB-INF", "Laboratóriu Informátika", "LAB"),
        ("BIBL", "Biblioteka", "LIBRARY"),
        ("SALAO", "Salaun Boot", "HALL"),
    ]:
        rooms[code] = Room.objects.create(code=code, name=name, capacity=30, room_type=rtype)
    for i, (start, end) in enumerate(BELLS, start=1):
        BellPeriod.objects.create(name=f"Jam {i}", sequence=i, start_time=_t(start), end_time=_t(end))

    subjects = {code: Subject.objects.create(code=code, name=name, category=cat) for code, name, cat, _, _ in SUBJECTS}
    grades = {g.code: g for g in GradeLevel.objects.all()}
    majors = {m.code: m for m in Major.objects.all()}

    # Synthetic dates for demo only; real dates come from the official calendar (PRD §74.1).
    year = AcademicYear.objects.create(name="2026", start_date=date(2026, 1, 19), end_date=date(2026, 12, 4))
    tz = timezone.get_current_timezone()
    terms = [(1, date(2026, 1, 19), date(2026, 4, 10)), (2, date(2026, 4, 27), date(2026, 8, 7)), (3, date(2026, 8, 24), date(2026, 12, 4))]
    for n, start, end in terms:
        Trimester.objects.create(
            academic_year=year,
            number=n,
            cau_number=n,
            name=f"Trimestre {n}",
            start_date=start,
            end_date=end,
            grade_entry_start=datetime.combine(end - timedelta(days=14), time(7, 0), tz),
            grade_entry_end=datetime.combine(end + timedelta(days=7), time(17, 0), tz),
        )
    offerings = {}
    for grade in grades.values():
        for code, _, _, major_code, weekly in SUBJECTS:
            offerings[(grade.code, code)] = SubjectOffering.objects.create(
                academic_year=year,
                grade_level=grade,
                major=majors[major_code] if major_code else None,
                subject=subjects[code],
                weekly_periods=weekly,
            )
    by_subject = {}
    for emp, _, _, subs, _ in TEACHERS:
        for sub in subs:
            by_subject.setdefault(sub, []).append(teachers[emp])
    rr = {k: 0 for k in by_subject}
    for code, name, grade, major, homeroom, room in CLASSES:
        cls = ClassRoom.objects.create(
            academic_year=year,
            grade_level=grades[grade],
            major=majors[major],
            code=code,
            name=name,
            homeroom_teacher=teachers[homeroom],
            default_room=rooms[room],
            capacity=36,
        )
        for (g, sub), off in offerings.items():
            if g != grade or not off.applies_to(cls):
                continue
            pool = by_subject[sub]
            teacher = pool[rr[sub] % len(pool)]
            rr[sub] += 1
            TeachingAssignment.objects.create(academic_year=year, teacher=teacher, classroom=cls, subject_offering=off)
    SchoolCalendarEvent.objects.create(
        academic_year=year,
        event_type="HOLIDAY",
        title="Loron Restaurasaun Independénsia",
        start_at=date(2026, 5, 20),
        end_at=date(2026, 5, 20),
        affects_classes=True,
    )
    SchoolCalendarEvent.objects.create(
        academic_year=year,
        trimester=year.trimesters.get(number=3),
        event_type="EXAM",
        title="CAU 3",
        start_at=date(2026, 11, 16),
        end_at=date(2026, 11, 27),
        affects_classes=True,
    )
    SchoolCalendarEvent.objects.create(
        academic_year=year,
        event_type="HOLIDAY",
        title="Loron Proklamasaun Independénsia",
        start_at=date(2026, 11, 28),
        end_at=date(2026, 11, 28),
        affects_classes=True,
    )

    admin = users.get("admin")
    services.activate_year(actor=admin, year=year)
    # T1/T2 end in GRADING (closed later by the grades seeder after finalization); T3 is the running trimester.
    for t in year.trimesters.order_by("number"):
        services.advance_trimester(actor=admin, trimester=t, target="ACTIVE")
        if t.number < 3:
            services.advance_trimester(actor=admin, trimester=t, target="GRADING")
    return {"teachers": len(teachers), "classrooms": len(CLASSES), "offerings": len(offerings)}

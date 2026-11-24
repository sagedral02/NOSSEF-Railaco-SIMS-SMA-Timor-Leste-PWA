"""Synthetic library demo data (local only)."""

from datetime import timedelta

from django.db import transaction

BOOKS = [
    ("Matemátika Ensinu Sekundáriu 10", "Ministériu Edukasaun", "Matemátika"),
    ("Matemátika Ensinu Sekundáriu 11", "Ministériu Edukasaun", "Matemátika"),
    ("Física Básica", "A. Pereira", "Siénsia"),
    ("Química Geral", "M. Ximenes", "Siénsia"),
    ("Biologia Moderna", "L. Soares", "Siénsia"),
    ("História de Timor-Leste", "J. da Costa", "Istória"),
    ("Geografia Física", "R. Amaral", "Jeografia"),
    ("Gramática da Língua Portuguesa", "C. Cunha", "Língua"),
    ("Disionáriu Tetun–Portugés", "INL", "Referénsia"),
    ("English for Secondary Schools", "Oxford", "Língua"),
    ("Ekonomia Introdusaun", "F. Martins", "Ekonomia"),
    ("Sosiolojia Baziku", "T. Guterres", "Sosiál"),
    ("Kompiuter no Teknolojia", "S. Pinto", "TIK"),
    ("Literatura Lusófona", "Antolojia", "Literatura"),
    ("Atlas Mundial", "Lexus", "Referénsia"),
]


@transaction.atomic
def seed_demo_library():
    from django.utils import timezone

    from common.seeding import assert_demo_allowed
    from modules.accounts.models import User
    from modules.staff.models import Teacher
    from modules.students.models import Student

    from . import services
    from .models import LibraryBook, LibraryCopy, LibraryLoan

    assert_demo_allowed()
    if LibraryBook.objects.exists():
        return {"skipped": True}
    lib = User.objects.get(username="biblioteka")
    copies = []
    for i, (title, author, cat) in enumerate(BOOKS):
        b = LibraryBook.objects.create(
            title=title, author=author, category=cat, publication_year=2015 + i % 8, language="pt" if i % 3 else "tet"
        )
        for j in range(2 + i % 3):
            copies.append(LibraryCopy.objects.create(book=b, barcode=f"LIB-{i + 1:03d}-{j + 1}", shelf=f"{cat[:3].upper()}-{1 + j}"))
    kids = list(Student.objects.filter(status="ACTIVE").order_by("student_no")[:30])
    teachers = list(Teacher.objects.filter(employment_status="ACTIVE")[:3])
    now = timezone.now()
    loans = 0
    for i, c in enumerate(copies[:24]):
        loan = (
            services.checkout(
                actor=lib, copy=c, student=kids[i] if i < 21 else None, teacher=teachers[i - 21] if i >= 21 and teachers else None
            )
            if (i < 21 or teachers)
            else None
        )
        if loan is None:
            continue
        loans += 1
        back = 3 + (i * 2) % 20  # spread borrow dates; some are overdue
        LibraryLoan.objects.filter(pk=loan.pk).update(
            borrowed_at=now - timedelta(days=back), due_at=services.due_after(7, now - timedelta(days=back))
        )
        if i % 4 == 0:
            loan.refresh_from_db()
            services.return_loan(actor=lib, loan=loan)
    services.refresh_overdue()
    services.set_copy_status(actor=lib, copy=copies[-1], status="WITHDRAWN", note="Rusak berat (demo)")
    return {"books": len(BOOKS), "copies": len(copies), "loans": loans}

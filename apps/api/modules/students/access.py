"""File access for student-owned documents (photo, transfer letters)."""

from modules.documents.access import register

from .models import Student, StudentTransfer
from .selectors import students_visible_to


@register
def student_files(user, file):
    owners = Student.objects.filter(photo_file=file).values("pk")
    transfer_owners = StudentTransfer.objects.filter(document_file=file).values("student_id")
    if not owners.exists() and not transfer_owners.exists():
        return None
    visible = students_visible_to(user)
    return visible.filter(pk__in=owners).exists() or visible.filter(pk__in=transfer_owners).exists()

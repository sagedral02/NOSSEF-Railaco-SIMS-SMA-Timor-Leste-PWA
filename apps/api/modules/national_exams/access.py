"""National exam certificates are restricted: report.view staff, or the student/guardian scope."""

from common.permissions import user_has_perm
from modules.documents.access import register
from modules.students.selectors import students_visible_to

from .models import NationalExamRecord


@register
def national_exam_files(user, file):
    owners = NationalExamRecord.objects.filter(document_file=file).values("student_id")
    if not owners.exists():
        return None
    return (
        user_has_perm(user, "report.view")
        and students_visible_to(user, "report.view").filter(pk__in=owners).exists()
        or (students_visible_to(user).filter(pk__in=owners, user=user).exists())
    )

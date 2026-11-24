"""Leave evidence files: readable by whoever can see the student with attendance.view scope."""

from modules.documents.access import register
from modules.students.selectors import students_visible_to

from .models import StudentLeaveRequest


@register
def leave_files(user, file):
    owners = StudentLeaveRequest.objects.filter(supporting_file=file).values("student_id")
    if not owners.exists():
        return None
    return students_visible_to(user, "attendance.view").filter(pk__in=owners).exists()

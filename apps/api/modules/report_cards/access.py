"""Report PDFs: visible according to report scope (staff/homeroom) or own/child published reports."""

from modules.documents.access import register

from .models import ReportCard


@register
def report_files(user, file):
    report = ReportCard.objects.filter(pdf_file=file).first()
    if report is None:
        return None
    from .api.views import visible_reports

    return visible_reports(user).filter(pk=report.pk).exists()

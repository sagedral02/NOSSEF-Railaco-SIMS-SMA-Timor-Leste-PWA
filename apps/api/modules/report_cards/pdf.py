"""Deterministic report-card PDF (PRD §23.1, F8-05). Rendered from the immutable snapshot only."""

import io
from decimal import Decimal

from reportlab.graphics import renderPDF
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

INK = colors.HexColor("#1E1919")
MUTED = colors.HexColor("#524A3E")
LINE = colors.HexColor("#E6E4E0")


def _fmt(value, places=2):
    if value in (None, ""):
        return "—"
    return f"{Decimal(str(value)):.{places}f}"


def render(report, verify_url=None) -> bytes:
    snap = report.snapshot
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4, invariant=1)  # invariant=1 → byte-stable output for the same input
    width, height = A4
    x0, y = 18 * mm, height - 20 * mm

    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 13)
    c.drawString(x0, y, snap.get("school_name", ""))
    c.setFont("Helvetica", 9)
    c.setFillColor(MUTED)
    c.drawString(x0, y - 12, f"Relatóriu Valór / Rapor Trimestre · {snap.get('academic_year', '')} · Trimestre {snap.get('trimester', '')}")
    c.drawRightString(width - x0, y - 12, f"Rev. {report.revision_no}")
    y -= 24
    c.setStrokeColor(LINE)
    c.line(x0, y, width - x0, y)
    y -= 16

    c.setFillColor(INK)
    rows = [
        ("Naran / Nama", snap.get("student_name", "")),
        ("NIS", snap.get("student_no", "")),
        ("Turma / Rombel", snap.get("classroom", "")),
        ("Nível / Tingkat · Área / Jurusan", f"{snap.get('grade', '')} · {snap.get('major', '')}"),
    ]
    for k, v in rows:
        c.setFont("Helvetica", 9)
        c.setFillColor(MUTED)
        c.drawString(x0, y, k)
        c.setFillColor(INK)
        c.setFont("Helvetica-Bold", 10)
        c.drawString(x0 + 62 * mm, y, str(v))
        y -= 14
    y -= 6

    headers = ["Kódigu", "Disiplina / Mata Pelajaran", "CAU", "Valór Finál", "Rezultadu"]
    cols = [x0, x0 + 20 * mm, x0 + 110 * mm, x0 + 130 * mm, x0 + 152 * mm]
    c.setFillColor(colors.HexColor("#F7F5F2"))
    c.rect(x0 - 2, y - 4, width - 2 * x0 + 4, 16, stroke=0, fill=1)
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 8.5)
    for h, cx in zip(headers, cols, strict=True):
        c.drawString(cx, y, h)
    y -= 16
    c.setFont("Helvetica", 9)
    for s in snap.get("subjects", []):
        c.drawString(cols[0], y, s["subject_code"])
        c.drawString(cols[1], y, s["subject_name"][:52])
        c.drawString(cols[2], y, _fmt(s.get("cau_score")))
        c.drawString(cols[3], y, _fmt(s["final_score"]))
        c.drawString(cols[4], y, s.get("grade_label") or "—")
        y -= 13
        c.setStrokeColor(LINE)
        c.line(x0, y + 9, width - x0, y + 9)
    y -= 8
    c.setFont("Helvetica-Bold", 9.5)
    c.drawString(x0, y, f"Média / Rata-rata: {_fmt(snap.get('average'))}")
    y -= 18

    att = report.attendance_summary or {}
    c.setFont("Helvetica-Bold", 9.5)
    c.drawString(x0, y, "Prezensa / Kehadiran")
    c.setFont("Helvetica", 9)
    y -= 13
    c.drawString(
        x0,
        y,
        "  ".join(f"{k}: {v}" for k, v in (att.get("counts") or {}).items())
        + (f"   ({att.get('rate')}%)" if att.get("rate") is not None else ""),
    )
    y -= 20
    c.setFont("Helvetica-Bold", 9.5)
    c.drawString(x0, y, "Nota Profesor da Turma / Catatan Wali Kelas")
    c.setFont("Helvetica", 9)
    for line in (report.homeroom_note or "—").splitlines()[:6]:
        y -= 13
        c.drawString(x0, y, line[:110])

    if verify_url:
        qr = QrCodeWidget(verify_url)
        b = qr.getBounds()
        size = 28 * mm
        d = Drawing(size, size, transform=[size / (b[2] - b[0]), 0, 0, size / (b[3] - b[1]), 0, 0])
        d.add(qr)
        renderPDF.draw(d, c, width - x0 - size, 18 * mm)
        c.setFont("Helvetica", 7)
        c.setFillColor(MUTED)
        c.drawRightString(width - x0, 15 * mm, "Verifika / Verifikasi")
    c.setFont("Helvetica", 7.5)
    c.setFillColor(MUTED)
    c.drawString(x0, 15 * mm, f"Publika / Terbit: {snap.get('published_at', '—')} · ID {report.pk}")
    c.showPage()
    c.save()
    return buf.getvalue()

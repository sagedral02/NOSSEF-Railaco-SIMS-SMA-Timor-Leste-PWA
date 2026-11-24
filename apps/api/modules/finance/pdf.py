"""Receipt PDF from the immutable snapshot (PRD §15.58)."""

import io

from reportlab.lib import colors
from reportlab.lib.pagesizes import A5, landscape
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

INK = colors.HexColor("#1E1919")
MUTED = colors.HexColor("#524A3E")
LINE = colors.HexColor("#E6E4E0")


def render_receipt(receipt) -> bytes:
    s = receipt.snapshot
    buf = io.BytesIO()
    size = landscape(A5)
    c = canvas.Canvas(buf, pagesize=size, invariant=1)
    w, h = size
    x0, y = 14 * mm, h - 16 * mm
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(x0, y, s.get("school_name", ""))
    c.setFont("Helvetica-Bold", 11)
    c.drawRightString(w - x0, y, "KUITANSI / RESIBU")
    c.setFont("Helvetica", 9)
    c.setFillColor(MUTED)
    c.drawRightString(w - x0, y - 12, f"No. {receipt.receipt_no}")
    y -= 26
    c.setStrokeColor(LINE)
    c.line(x0, y, w - x0, y)
    y -= 16
    rows = [
        ("Siswa / Estudante", f"{s.get('student_name', '')} ({s.get('student_no', '')})"),
        ("Rombel / Turma", s.get("classroom", "")),
        ("No. pembayaran", s.get("payment_no", "")),
        ("Tanggal", s.get("payment_date", "")),
        ("Metode", s.get("method", "") + (f" · Ref {s['reference_no']}" if s.get("reference_no") else "")),
        ("Diterima oleh", s.get("received_by", "")),
    ]
    for k, v in rows:
        c.setFillColor(MUTED)
        c.setFont("Helvetica", 9)
        c.drawString(x0, y, k)
        c.setFillColor(INK)
        c.drawString(x0 + 42 * mm, y, str(v))
        y -= 13
    y -= 6
    c.setFont("Helvetica-Bold", 9)
    c.drawString(x0, y, "Tagihan")
    c.drawString(x0 + 50 * mm, y, "Periode")
    c.drawRightString(w - x0 - 40 * mm, y, "Dibayar (USD)")
    c.drawRightString(w - x0, y, "Sisa (USD)")
    y -= 4
    c.line(x0, y, w - x0, y)
    c.setFont("Helvetica", 9)
    for a in s.get("allocations", []):
        y -= 13
        c.drawString(x0, y, a["invoice_no"])
        c.drawString(x0 + 50 * mm, y, a.get("period") or "-")
        c.drawRightString(w - x0 - 40 * mm, y, a["amount"])
        c.drawRightString(w - x0, y, a.get("balance_after", ""))
    y -= 20
    c.setFont("Helvetica-Bold", 12)
    c.drawString(x0, y, "TOTAL")
    c.drawRightString(w - x0, y, f"USD {s.get('amount', '')}")
    c.setFont("Helvetica", 7)
    c.setFillColor(MUTED)
    c.drawString(
        x0,
        10 * mm,
        f"Dokumen dibuat sistem · {receipt.issued_at:%Y-%m-%d %H:%M} UTC · Pembayaran yang direversal tetap tercatat sebagai riwayat.",
    )
    c.showPage()
    c.save()
    return buf.getvalue()

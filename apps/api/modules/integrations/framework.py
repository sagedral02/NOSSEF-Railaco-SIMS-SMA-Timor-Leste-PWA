"""Import pipeline framework (PRD §32.2). Importers register a type with: permission check, template, parse/validate,
apply. Parsing produces normalized rows + row errors; nothing is written to domain tables until confirm."""

import csv
import io
import re
from dataclasses import dataclass, field

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font, PatternFill

REGISTRY = {}


@dataclass
class ParseResult:
    rows: list[dict] = field(default_factory=list)  # normalized rows: {"row": n, ...}
    errors: list[dict] = field(default_factory=list)  # {"row": n, "field": f, "code": c, "message": m, "raw": v}
    header_error: str | None = None


class Importer:
    import_type = ""
    label = ""
    template_version = "1"

    def check_permission(self, user, params):  # raise DomainError when not allowed
        raise NotImplementedError

    def validate_params(self, params):
        return params

    def template(self, params) -> tuple[bytes, str]:
        raise NotImplementedError

    def parse(self, table: list[list[str]], params) -> ParseResult:
        raise NotImplementedError

    def apply(self, job, rows, actor) -> dict:
        raise NotImplementedError


def register(cls):
    REGISTRY[cls.import_type] = cls()
    return cls


def read_table(data: bytes, mime: str) -> list[list[str]]:
    """Return all rows as lists of strings (cells stripped; numbers kept as text without float artifacts)."""
    if mime == "text/csv":
        text = data.decode("utf-8-sig")
        dialect = csv.Sniffer().sniff(text.splitlines()[0] if text else ",", delimiters=",;\t")
        return [[c.strip() for c in row] for row in csv.reader(io.StringIO(text), dialect)]
    wb = load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    ws = wb.worksheets[0]
    out = []
    for row in ws.iter_rows(values_only=True):
        cells = []
        for v in row:
            if v is None:
                cells.append("")
            elif isinstance(v, float):
                cells.append(f"{v:.4f}".rstrip("0").rstrip("."))
            else:
                cells.append(str(v).strip())
        out.append(cells)
    return out


def build_xlsx(title: str, headers: list[str], rows: list[list], meta: dict, notes: list[str] | None = None) -> bytes:
    """Template/result workbook with a metadata sheet (template version, PRD §32.2)."""
    wb = Workbook()
    ws = wb.active
    ws.title = re.sub(r"[\[\]:*?/\\]", "-", title)[:31]  # Excel forbids []:*?/\ in sheet names
    ws.append(headers)
    head_fill = PatternFill("solid", fgColor="1E1919")
    for cell in ws[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = head_fill
    for r in rows:
        ws.append(r)
    for i, h in enumerate(headers, start=1):
        ws.column_dimensions[ws.cell(row=1, column=i).column_letter].width = max(12, min(40, len(str(h)) + 4))
    ws.freeze_panes = "C2"
    m = wb.create_sheet("_meta")
    for k, v in meta.items():
        m.append([k, str(v)])
    for n in notes or []:
        m.append(["note", n])
    m.sheet_state = "hidden"
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()

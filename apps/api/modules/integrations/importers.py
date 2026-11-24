"""Master-data importers (PRD §32.1): students(+guardian), teachers, subjects, library books/copies, assets.

Each declares versioned headers, explicit identity matching, strict normalization (no silent coercion of invalid
dates/money) and a per-row action (CREATE/UPDATE/SKIP) shown in the preview. Apply runs row-by-row in savepoints so
one bad row does not undo the rest; outcomes go to the downloadable result file.
"""

from datetime import date
from decimal import Decimal, InvalidOperation

from django.db import transaction

from common.api.exceptions import DomainError, ErrorCode
from common.permissions import user_has_global

from .framework import Importer, ParseResult, build_xlsx, register


class Col:
    def __init__(self, name, required=False, kind="str", choices=None, max_len=None):
        self.name, self.required, self.kind, self.choices, self.max_len = name, required, kind, choices, max_len


def _norm(col, raw):
    v = (raw or "").strip()
    if not v:
        if col.required:
            raise ValueError("REQUIRED", "Wajib diisi.")
        return None
    if col.max_len and len(v) > col.max_len:
        raise ValueError("TOO_LONG", f"Maksimal {col.max_len} karakter.")
    if col.kind == "date":
        try:
            return date.fromisoformat(v[:10]).isoformat()
        except ValueError:
            raise ValueError("INVALID_DATE", "Tanggal harus YYYY-MM-DD.")
    if col.kind == "decimal":
        try:
            d = Decimal(v.replace(",", "."))
        except InvalidOperation:
            raise ValueError("INVALID_NUMBER", "Angka tidak valid.")
        if d < 0:
            raise ValueError("INVALID_NUMBER", "Tidak boleh negatif.")
        return str(d.quantize(Decimal("0.01")))
    if col.kind == "int":
        if not v.isdigit():
            raise ValueError("INVALID_NUMBER", "Harus bilangan bulat.")
        return int(v)
    if col.kind == "bool":
        if v.lower() not in {"1", "0", "ya", "tidak", "true", "false", "y", "n"}:
            raise ValueError("INVALID_BOOL", "Isi Ya/Tidak.")
        return v.lower() in {"1", "ya", "true", "y"}
    if col.choices:
        up = v.upper()
        if up not in col.choices:
            raise ValueError("INVALID_CHOICE", f"Pilihan: {', '.join(col.choices)}.")
        return up
    return v


class TabularImporter(Importer):
    columns: list = []
    permission = ""
    notes: list = []

    def check_permission(self, user, params):
        if not (user_has_global(user, self.permission) or user_has_global(user, "system.import")):
            raise DomainError(ErrorCode.PERMISSION_DENIED, "Anda tidak memiliki izin untuk impor ini.", status_code=403)

    def template(self, params):
        headers = [c.name for c in self.columns]
        return build_xlsx(
            self.label,
            headers,
            [self.example()],
            {"import_type": self.import_type, "template_version": self.template_version},
            notes=[
                f"{c.name}: {'wajib' if c.required else 'opsional'}" + (f" ({'/'.join(c.choices)})" if c.choices else "")
                for c in self.columns
            ]
            + self.notes,
        ), f"template_{self.import_type.lower()}_v{self.template_version}.xlsx"

    def example(self):
        return []

    def identify(self, row, params):
        """Return (action, message) — CREATE/UPDATE/SKIP — or raise ValueError(code, message)."""
        return "CREATE", ""

    def apply_row(self, row, actor, params):
        raise NotImplementedError

    def parse(self, table, params):
        res = ParseResult()
        expected = [c.name for c in self.columns]
        if not table or [h.strip().lower() for h in table[0][: len(expected)]] != expected:
            res.header_error = f"Header harus: {', '.join(expected)} (template v{self.template_version})."
            return res
        seen = {}
        for n, raw in enumerate(table[1:], start=2):
            if not any((c or "").strip() for c in raw):
                continue
            row, bad = {"row": n}, False
            for i, col in enumerate(self.columns):
                try:
                    row[col.name] = _norm(col, raw[i] if i < len(raw) else "")
                except ValueError as e:
                    code, msg = e.args
                    res.errors.append(
                        {"row": n, "field": col.name, "code": f"IMPORT_{code}", "message": msg, "raw": raw[i] if i < len(raw) else ""}
                    )
                    bad = True
            if bad:
                continue
            key = self.row_key(row)
            if key and key in seen:
                res.errors.append(
                    {
                        "row": n,
                        "field": "",
                        "code": "IMPORT_DUPLICATE_IN_FILE",
                        "message": f"Sama dengan baris {seen[key]}.",
                        "raw": str(key),
                    }
                )
                continue
            if key:
                seen[key] = n
            try:
                row["action"], row["message"] = self.identify(row, params)
            except ValueError as e:
                code, msg = e.args
                res.errors.append({"row": n, "field": "", "code": f"IMPORT_{code}", "message": msg, "raw": ""})
                continue
            res.rows.append(row)
        return res

    def row_key(self, row):
        return None

    def apply(self, job, rows, actor):
        outcomes, counts = [], {"created": 0, "updated": 0, "skipped": 0, "errors": 0}
        for row in rows:
            if row.get("action") == "SKIP":
                counts["skipped"] += 1
                outcomes.append({"row": row["row"], "outcome": "SKIPPED", "message": row.get("message", "")})
                continue
            try:
                with transaction.atomic():
                    msg = self.apply_row(row, actor, job.params) or ""
                counts["created" if row["action"] == "CREATE" else "updated"] += 1
                outcomes.append({"row": row["row"], "outcome": row["action"], "message": msg})
            except Exception as exc:  # noqa: BLE001 - recorded per row; other rows continue (non-atomic mode)
                counts["errors"] += 1
                outcomes.append({"row": row["row"], "outcome": "ERROR", "message": getattr(exc, "message", None) or str(exc)[:300]})
        return {**counts, "rows": outcomes}


# ------------------------------------------------------------------ students (+ guardian, enrollment)


@register
class StudentImporter(TabularImporter):
    import_type = "STUDENTS"
    label = "Siswa"
    permission = "student.create"
    columns = [
        Col("student_no", max_len=30),
        Col("national_student_no", max_len=50),
        Col("full_name", True, max_len=200),
        Col("gender", True, choices=["M", "F"]),
        Col("birth_date", True, "date"),
        Col("birth_place", max_len=100),
        Col("admission_date", False, "date"),
        Col("classroom_code", max_len=40),
        Col("phone", max_len=50),
        Col("guardian_name", max_len=200),
        Col("guardian_phone", max_len=50),
        Col("guardian_relationship", choices=["FATHER", "MOTHER", "GUARDIAN", "OTHER"]),
    ]
    notes = [
        "Identitas: student_no → national_student_no. Nama + tanggal lahir yang sama dengan siswa lain ditolak sebagai dugaan duplikat.",
        "Baris dengan siswa yang sudah ada akan memperbarui biodata (tanpa mengubah rombel).",
    ]

    def example(self):
        return ["", "", "Nome Estudante", "F", "2010-05-17", "Dili", "2026-01-19", "X-IPA-1", "", "Nome Inan", "+670 7700 0000", "MOTHER"]

    def row_key(self, row):
        return row["student_no"] or row["national_student_no"] or f"{row['full_name'].lower()}|{row['birth_date']}"

    def _existing(self, row):
        from modules.students.models import Student

        if row["student_no"]:
            return Student.objects.filter(student_no=row["student_no"]).first()
        if row["national_student_no"]:
            return Student.objects.filter(national_student_no=row["national_student_no"]).first()
        return None

    def identify(self, row, params):
        from modules.academics.models import ClassRoom
        from modules.students.models import Student

        if row["classroom_code"] and not ClassRoom.objects.filter(code=row["classroom_code"], academic_year__is_current=True).exists():
            raise ValueError("UNKNOWN_CLASSROOM", f"Rombel {row['classroom_code']} tidak ada di tahun berjalan.")
        if (s := self._existing(row)) is not None:
            return "UPDATE", f"{s.student_no} {s.full_name}"
        if row["student_no"]:
            return "CREATE", "NIS dari file"
        if Student.objects.filter(full_name__iexact=row["full_name"], birth_date=row["birth_date"]).exists():
            raise ValueError("DUPLICATE_SUSPECTED", "Siswa dengan nama & tanggal lahir sama sudah ada; isi student_no untuk memperbarui.")
        return "CREATE", ""

    def apply_row(self, row, actor, params):
        from modules.academics.models import ClassRoom
        from modules.students import services
        from modules.students.models import Guardian

        data = {
            k: row[k]
            for k in ("full_name", "national_student_no", "birth_place", "birth_date", "gender", "phone")
            if row.get(k) is not None
        }
        data["birth_date"] = date.fromisoformat(row["birth_date"])
        if row["action"] == "UPDATE":
            s = self._existing(row)
            services.update_student(actor=actor, student=s, data=data)
            return s.student_no
        if row.get("admission_date"):
            data["admission_date"] = date.fromisoformat(row["admission_date"])
        if row["student_no"]:
            data["student_no"] = row["student_no"]
        cls = (
            ClassRoom.objects.filter(code=row["classroom_code"], academic_year__is_current=True).first() if row["classroom_code"] else None
        )
        s = services.create_student(actor=actor, data=data, classroom=cls)
        if row.get("guardian_name"):
            g = Guardian(full_name=row["guardian_name"], phone=row.get("guardian_phone") or "")
            g.full_clean()
            g.save()
            services.link_guardian(
                actor=actor,
                student=s,
                guardian=g,
                relationship=row.get("guardian_relationship") or "GUARDIAN",
                is_primary=True,
                financial_contact=True,
            )
        return s.student_no


# ------------------------------------------------------------------ teachers


@register
class TeacherImporter(TabularImporter):
    import_type = "TEACHERS"
    label = "Guru"
    permission = "staff.manage"
    columns = [
        Col("employee_no", True, max_len=50),
        Col("full_name", True, max_len=200),
        Col("gender", choices=["M", "F"]),
        Col("phone", max_len=50),
        Col("email", max_len=254),
        Col("join_date", kind="date"),
    ]
    notes = ["Identitas: employee_no (diperbarui bila sudah ada)."]

    def example(self):
        return ["G-2026-001", "Nome Profesór", "M", "+670 7700 0001", "", "2026-01-05"]

    def row_key(self, row):
        return row["employee_no"]

    def identify(self, row, params):
        from modules.staff.models import Teacher

        return ("UPDATE", "") if Teacher.objects.filter(employee_no=row["employee_no"]).exists() else ("CREATE", "")

    def apply_row(self, row, actor, params):
        from modules.staff.models import Teacher

        t = Teacher.objects.filter(employee_no=row["employee_no"]).first() or Teacher(employee_no=row["employee_no"])
        for k in ("full_name", "gender", "phone", "email"):
            if row.get(k) is not None:
                setattr(t, k, row[k])
        if row.get("join_date"):
            t.join_date = date.fromisoformat(row["join_date"])
        t.full_clean()
        t.save()


# ------------------------------------------------------------------ subjects


@register
class SubjectImporter(TabularImporter):
    import_type = "SUBJECTS"
    label = "Mata pelajaran"
    permission = "academic.manage_subject"
    columns = [
        Col("code", True, max_len=30),
        Col("name", True, max_len=150),
        Col("short_name", max_len=30),
        Col("category", choices=["CORE", "MAJOR", "ELECTIVE", "OTHER"]),
    ]
    notes = ["Identitas: code."]

    def example(self):
        return ["MAT", "Matemátika", "Mat", "CORE"]

    def row_key(self, row):
        return row["code"].upper()

    def identify(self, row, params):
        from modules.academics.models import Subject

        return ("UPDATE", "") if Subject.objects.filter(code__iexact=row["code"]).exists() else ("CREATE", "")

    def apply_row(self, row, actor, params):
        from modules.academics.models import Subject

        s = Subject.objects.filter(code__iexact=row["code"]).first() or Subject(code=row["code"].upper())
        s.name = row["name"]
        if row.get("short_name") is not None:
            s.short_name = row["short_name"]
        if row.get("category"):
            s.category = row["category"]
        s.full_clean()
        s.save()


# ------------------------------------------------------------------ library


@register
class LibraryImporter(TabularImporter):
    import_type = "LIBRARY"
    label = "Buku perpustakaan"
    permission = "library.manage_catalog"
    columns = [
        Col("barcode", True, max_len=80),
        Col("title", True, max_len=250),
        Col("author", max_len=200),
        Col("isbn", max_len=30),
        Col("publisher", max_len=200),
        Col("publication_year", kind="int"),
        Col("category", max_len=100),
        Col("shelf", max_len=50),
    ]
    notes = [
        "Satu baris = satu eksemplar. Buku dicocokkan dengan ISBN, atau judul+penulis bila ISBN kosong. Barcode yang sudah ada dilewati."
    ]

    def example(self):
        return ["LIB-900-1", "Matemátika 12", "Ministériu Edukasaun", "", "", "2024", "Matemátika", "MAT-1"]

    def row_key(self, row):
        return row["barcode"].lower()

    def identify(self, row, params):
        from modules.library.models import LibraryCopy

        return (
            ("SKIP", "Barcode sudah terdaftar") if LibraryCopy.objects.filter(barcode__iexact=row["barcode"]).exists() else ("CREATE", "")
        )

    def apply_row(self, row, actor, params):
        from modules.library.models import LibraryBook, LibraryCopy

        book = (LibraryBook.objects.filter(isbn=row["isbn"]).first() if row.get("isbn") else None) or LibraryBook.objects.filter(
            title__iexact=row["title"], author__iexact=row.get("author") or ""
        ).first()
        if book is None:
            book = LibraryBook.objects.create(
                title=row["title"],
                author=row.get("author") or "",
                isbn=row.get("isbn") or "",
                publisher=row.get("publisher") or "",
                publication_year=row.get("publication_year"),
                category=row.get("category") or "",
            )
        LibraryCopy.objects.create(book=book, barcode=row["barcode"], shelf=row.get("shelf") or "")


# ------------------------------------------------------------------ assets


@register
class AssetImporter(TabularImporter):
    import_type = "ASSETS"
    label = "Aset"
    permission = "asset.manage"
    columns = [
        Col("asset_no", True, max_len=80),
        Col("name", True, max_len=200),
        Col("category", True, max_len=100),
        Col("serial_no", max_len=100),
        Col("purchase_date", kind="date"),
        Col("purchase_cost", kind="decimal"),
        Col("room_code", max_len=30),
        Col("condition", choices=["GOOD", "FAIR", "DAMAGED", "REPAIR"]),
    ]
    notes = ["Identitas: asset_no. Aset yang ada diperbarui (status/penugasan tidak diubah lewat impor)."]

    def example(self):
        return ["NOS-TIK-9001", "Laptop", "TIK", "SN-1", "2025-02-01", "650.00", "", "GOOD"]

    def row_key(self, row):
        return row["asset_no"].lower()

    def identify(self, row, params):
        from modules.academics.models import Room
        from modules.assets.models import Asset

        if row.get("room_code") and not Room.objects.filter(code=row["room_code"]).exists():
            raise ValueError("UNKNOWN_ROOM", f"Ruang {row['room_code']} tidak ditemukan.")
        return ("UPDATE", "") if Asset.objects.filter(asset_no__iexact=row["asset_no"]).exists() else ("CREATE", "")

    def apply_row(self, row, actor, params):
        from modules.academics.models import Room
        from modules.assets.models import Asset
        from modules.audit import services as audit
        from modules.audit.events import AuditEvent

        a = Asset.objects.filter(asset_no__iexact=row["asset_no"]).first() or Asset(asset_no=row["asset_no"])
        for k in ("name", "category", "serial_no", "condition"):
            if row.get(k) is not None:
                setattr(a, k, row[k])
        if row.get("purchase_date"):
            a.purchase_date = date.fromisoformat(row["purchase_date"])
        if row.get("purchase_cost") is not None:
            a.purchase_cost = Decimal(row["purchase_cost"])
        if row.get("room_code"):
            a.location_room = Room.objects.get(code=row["room_code"])
        a.full_clean()
        a.save()
        audit.record(AuditEvent.ASSET_CHANGED, actor=actor, resource=a, metadata={"action": "import"})

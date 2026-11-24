"""Score import (PRD F7-15): Excel/CSV template per teaching assignment + trimester, preview, confirm.

Columns: student_no, full_name, then one column per OPEN assessment titled "<title> #<short id>". Cell values: number
(0..max), empty (unchanged), A (ABSENT), E (EXCUSED). Apply reuses save_scores so every business rule (window, finalized
grades, revision reasons) still holds.
"""

from decimal import Decimal, InvalidOperation

from common.api.exceptions import DomainError, ErrorCode, ScopeDenied
from modules.academics.models import TeachingAssignment, Trimester
from modules.integrations.framework import Importer, ParseResult, build_xlsx, register

from . import services
from .models import Assessment

CODES = {"A": "ABSENT", "E": "EXCUSED"}


def _header(a):
    return f"{a.title} #{str(a.pk)[:8]}"


@register
class ScoreImporter(Importer):
    import_type = "SCORES"
    label = "Nilai penilaian"

    def validate_params(self, params):
        ta = (
            TeachingAssignment.objects.select_related("classroom", "subject_offering__subject")
            .filter(pk=params.get("teaching_assignment"))
            .first()
        )
        tr = Trimester.objects.filter(pk=params.get("trimester")).first()
        fields = {}
        if ta is None:
            fields["teaching_assignment"] = ["Penugasan mengajar tidak ditemukan."]
        if tr is None:
            fields["trimester"] = ["Trimestre tidak ditemukan."]
        if fields:
            raise DomainError(ErrorCode.VALIDATION_ERROR, "Data tidak valid.", fields=fields)
        return {"teaching_assignment": str(ta.pk), "trimester": str(tr.pk)}

    def _objects(self, params):
        ta = TeachingAssignment.objects.select_related("classroom", "subject_offering__subject").get(pk=params["teaching_assignment"])
        tr = Trimester.objects.get(pk=params["trimester"])
        return ta, tr

    def check_permission(self, user, params):
        ta, _ = self._objects(params)
        if not services.can_manage_assignment(user, ta):
            raise ScopeDenied()

    def _assessments(self, ta, tr):
        return list(
            Assessment.objects.filter(teaching_assignment=ta, trimester=tr, status="OPEN").order_by(
                "grading_component__sequence", "assessment_date"
            )
        )

    def template(self, params):
        ta, tr = self._objects(params)
        items = self._assessments(ta, tr)
        students = services.roster(ta, tr)
        scores = {}
        for s in services.StudentScore.objects.filter(assessment__in=items).values("assessment_id", "student_id", "score", "status"):
            v = s["score"] if s["status"] == "GRADED" else {"ABSENT": "A", "EXCUSED": "E"}.get(s["status"], "")
            scores[(s["assessment_id"], s["student_id"])] = float(v) if isinstance(v, Decimal) else v
        rows = [[st.student_no, st.full_name, *[scores.get((a.pk, st.pk), "") for a in items]] for st in students]
        data = build_xlsx(
            "Nilai",
            ["student_no", "full_name", *[_header(a) for a in items]],
            rows,
            {"import_type": self.import_type, "template_version": self.template_version, "teaching_assignment": ta.pk, "trimester": tr.pk},
            notes=["Kosong = tidak diubah; A = absen; E = dispensasi.", *[f"{_header(a)}: maks {a.max_score}" for a in items]],
        )
        name = f"nilai_{ta.classroom.name}_{ta.subject_offering.subject.code}_{tr.name}.xlsx".replace(" ", "_")
        return data, name

    def parse(self, table, params):
        ta, tr = self._objects(params)
        result = ParseResult()
        if not table or [c.lower() for c in table[0][:2]] != ["student_no", "full_name"]:
            result.header_error = "Header tidak sesuai template (kolom student_no, full_name)."
            return result
        by_header = {_header(a): a for a in self._assessments(ta, tr)}
        columns = []
        for idx, h in enumerate(table[0][2:], start=2):
            if not h:
                continue
            a = by_header.get(h)
            if a is None:
                result.header_error = f"Kolom '{h}' bukan penilaian OPEN pada mapel/trimestre ini. Unduh template terbaru."
                return result
            columns.append((idx, a))
        roster = {s.student_no: s for s in services.roster(ta, tr)}
        seen = set()
        for n, raw in enumerate(table[1:], start=2):
            if not any(raw):
                continue
            no = raw[0] if raw else ""
            st = roster.get(no)
            if st is None:
                result.errors.append(
                    {
                        "row": n,
                        "field": "student_no",
                        "code": ErrorCode.ATTENDANCE_STUDENT_NOT_ENROLLED,
                        "message": "Siswa tidak ada di rombel ini.",
                        "raw": no,
                    }
                )
                continue
            if no in seen:
                result.errors.append(
                    {
                        "row": n,
                        "field": "student_no",
                        "code": ErrorCode.VALIDATION_ERROR,
                        "message": "Siswa muncul lebih dari sekali.",
                        "raw": no,
                    }
                )
                continue
            seen.add(no)
            values, ok = {}, True
            for idx, a in columns:
                cell = (raw[idx] if idx < len(raw) else "").strip()
                if cell == "":
                    continue
                if cell.upper() in CODES:
                    values[str(a.pk)] = {"status": CODES[cell.upper()], "score": None}
                    continue
                try:
                    d = Decimal(cell.replace(",", "."))
                except InvalidOperation:
                    d = None
                if d is None or d < 0 or d > a.max_score:
                    ok = False
                    result.errors.append(
                        {
                            "row": n,
                            "field": _header(a),
                            "code": ErrorCode.ASSESSMENT_SCORE_OUT_OF_RANGE,
                            "message": f"Nilai harus 0–{a.max_score}, A, atau E.",
                            "raw": cell,
                        }
                    )
                    continue
                values[str(a.pk)] = {"status": "GRADED", "score": str(d.quantize(Decimal("0.01")))}
            if ok:
                result.rows.append({"row": n, "student_id": str(st.pk), "student_no": no, "full_name": st.full_name, "values": values})
        return result

    def apply(self, job, rows, actor):
        ta, tr = self._objects(job.params)
        outcomes, errors, changed = [], 0, 0
        for a in self._assessments(ta, tr):
            items = [
                {"student_id": r["student_id"], **r["values"][str(a.pk)], "reason": "Impor Excel"} for r in rows if str(a.pk) in r["values"]
            ]
            if not items:
                continue
            try:
                changed += services.save_scores(actor=actor, assessment=a, items=items)
                outcomes.append({"row": "-", "outcome": "OK", "message": f"{a.title}: {len(items)} nilai"})
            except DomainError as exc:
                errors += 1
                bad = exc.details.get("rows", {}) if exc.details else {}
                no_by_id = {r["student_id"]: r["row"] for r in rows}
                if not bad:
                    outcomes.append({"row": "-", "outcome": "ERROR", "message": f"{a.title}: {exc.message}"})
                for sid, info in bad.items():
                    outcomes.append({"row": no_by_id.get(sid, "-"), "outcome": "ERROR", "message": f"{a.title}: {info.get('message')}"})
        return {"changed": changed, "errors": errors, "rows": outcomes}

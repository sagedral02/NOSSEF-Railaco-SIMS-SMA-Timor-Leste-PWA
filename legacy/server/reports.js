// Canonical report catalog + server-side rendering to XLSX / CSV / PDF.
import * as XLSX from 'xlsx';
import PDFDocument from 'pdfkit';

export const REPORTS = {
  'ADM-01': 'Rekap Pendaftar PPDB per Status & Jurusan',
  'STU-01': 'Daftar Siswa Aktif per Rombel',
  'STU-02': 'Penerima Beasiswa (Bolseiru)',
  'ATT-01': 'Rekap Presensi Harian',
  'ATT-02': 'Rekap Presensi per Siswa',
  'GRD-01': 'Kelengkapan Input Nilai per Mapel',
  'GRD-02': 'Ranking Jeral per Jurusan',
  'RPT-01': 'Status Penerbitan Rapor',
  'FIN-01': 'Penerimaan Pembayaran',
  'FIN-03': 'Rekapitulasi Tunggakan SPP',
  'LIB-01': 'Sirkulasi & Keterlambatan',
  'AST-01': 'Register Aset & Kondisi',
  'EXT-01': 'Keanggotaan Unit NOSSEF',
};

const avg = (a) => (a.length ? Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 100) / 100 : null);

/** Build report rows (first row = header) from live data. params: { classId, trimester } */
export function buildRows(code, db, params = {}) {
  const cls = (id) => db.classes.find((c) => c.id === id)?.name || '';
  const stuById = new Map(db.students.map((s) => [s.id, s]));
  const stu = db.students.filter((s) => !params.classId || s.classId === params.classId);
  const tri = params.trimester ? Number(params.trimester) : null;
  switch (code) {
    case 'ADM-01':
      return [['No. Registrasi', 'Nama', 'Sekolah Asal', 'Jurusan', 'Status', 'Skor Seleksi', 'Rank'], ...db.applicants.map((a) => [a.regNo, a.name, a.origin, a.majorPref, a.status, a.testScore, a.rank])];
    case 'STU-01':
      return [['NIS', 'EMIS', 'Nama', 'L/P', 'Rombel', 'Jurusan', 'Status'], ...stu.map((s) => [s.studentNo, s.nationalNo, s.name, s.gender, cls(s.classId), s.major, s.status])];
    case 'STU-02':
      return [['NIS', 'Nama', 'Rombel', 'Beasiswa'], ...stu.filter((s) => s.scholarship).map((s) => [s.studentNo, s.name, cls(s.classId), s.scholarship])];
    case 'ATT-01':
      return [['Tanggal', 'Rombel', 'Status Sesi', 'Hadir', 'Telat', 'Sakit', 'Izin', 'Alpa'], ...db.attendanceSessions.filter((a) => !params.classId || a.classId === params.classId).sort((a, b) => a.date.localeCompare(b.date)).map((a) => {
        const r = Object.values(a.records); const n = (k) => r.filter((x) => x.status === k).length;
        return [a.date, cls(a.classId), a.status, n('PRESENT'), n('LATE'), n('SICK'), n('PERMITTED'), n('ABSENT')];
      })];
    case 'ATT-02':
      return [['NIS', 'Nama', 'Rombel', 'Hadir', 'Telat', 'Sakit', 'Izin', 'Alpa', '% Hadir'], ...stu.map((s) => {
        const c = { PRESENT: 0, LATE: 0, SICK: 0, PERMITTED: 0, ABSENT: 0 };
        db.attendanceSessions.forEach((a) => { const r = a.records[s.id]; if (r) c[r.status]++; });
        const total = Object.values(c).reduce((x, y) => x + y, 0);
        return [s.studentNo, s.name, cls(s.classId), c.PRESENT, c.LATE, c.SICK, c.PERMITTED, c.ABSENT, total ? Math.round(((c.PRESENT + c.LATE) / total) * 1000) / 10 : null];
      })];
    case 'GRD-01':
      return [['Rombel', 'Mata Pelajaran', 'Trimestre 1', 'Trimestre 2', 'Trimestre 3'], ...db.teachingAssignments.filter((a) => !params.classId || a.classId === params.classId).map((a) => [
        cls(a.classId), db.subjects.find((x) => x.id === a.subjectId)?.name, ...[1, 2, 3].map((t) => db.termGrades.find((x) => x.classId === a.classId && x.subjectId === a.subjectId && x.trimester === t)?.status || 'DRAFT'),
      ])];
    case 'GRD-02': {
      const t = tri || 2;
      const rows = stu.map((s) => [s.studentNo, s.name, cls(s.classId), s.major, avg(db.scores.filter((x) => x.studentId === s.id && x.trimester === t && x.final != null).map((x) => x.final))])
        .sort((a, b) => (b[4] ?? 0) - (a[4] ?? 0));
      return [['Rank', 'NIS', 'Nama', 'Rombel', 'Jurusan', `Média T${t} (0-10)`], ...rows.map((r, i) => [i + 1, ...r])];
    }
    case 'RPT-01':
      return [['NIS', 'Nama', 'Rombel', 'Trimestre', 'Status', 'Revisi'], ...db.reportCards.filter((r) => (!tri || r.trimester === tri) && stuById.has(r.studentId) && (!params.classId || stuById.get(r.studentId).classId === params.classId)).map((r) => {
        const s = stuById.get(r.studentId); return [s.studentNo, s.name, cls(s.classId), r.trimester, r.status, r.revision];
      })];
    case 'FIN-01':
      return [['No. Pembayaran', 'Tanggal', 'NIS', 'Siswa', 'Metode', 'Bank', 'No. Kuitansi Bank', 'Nominal (USD)', 'Status', 'Kwitansi Sekolah'], ...db.payments.map((p) => {
        const s = stuById.get(p.studentId); return [p.paymentNo, p.receivedAt.slice(0, 10), s?.studentNo, s?.name, p.method === 'CASH' ? 'Tunai' : 'Kuitansi Bank', p.bank || '', p.proofRef || '', p.amount, p.status, p.receiptNo || ''];
      })];
    case 'FIN-03':
      return [['NIS', 'Nama', 'Rombel', 'Wali', 'HP Wali', 'Tunggakan (USD)'], ...stu.map((s) => {
        const bal = db.invoices.filter((i) => i.studentId === s.id && ['UNPAID', 'PARTIALLY_PAID'].includes(i.status)).reduce((t, i) => t + i.total - i.paid, 0);
        const g = db.guardians.find((x) => x.id === s.guardianId);
        return [s.studentNo, s.name, cls(s.classId), g?.name || '', g?.phone || '', Math.round(bal * 100) / 100];
      }).filter((r) => r[5] > 0)];
    case 'LIB-01':
      return [['Barcode', 'Judul', 'Peminjam', 'Dipinjam', 'Jatuh Tempo', 'Status'], ...db.loans.map((l) => {
        const c = db.libraryCopies.find((x) => x.id === l.copyId); const b = db.libraryBooks.find((x) => x.id === c?.bookId);
        const who = l.borrowerType === 'STUDENT' ? stuById.get(l.borrowerId)?.name : db.teachers.find((t) => t.id === l.borrowerId)?.name;
        return [c?.barcode, b?.title, who, l.borrowedAt, l.dueAt, l.status];
      })];
    case 'AST-01':
      return [['Kode Aset', 'Nama', 'No. Seri', 'Kategori', 'Kondisi', 'Status', 'Pemegang', 'Nilai (USD)'], ...db.assets.map((a) => [a.assetNo, a.name, a.serial, a.category, a.condition, a.status, a.assignee || '', a.cost])];
    case 'EXT-01':
      return [['Unit', 'NIS', 'Nama', 'Peran', 'Bergabung', 'Status'], ...db.memberships.map((m) => {
        const s = stuById.get(m.studentId); return [db.activities.find((a) => a.id === m.activityId)?.name, s?.studentNo, s?.name, m.role, m.joinedAt, m.status];
      })];
    default:
      throw new Error(`Kode laporan tidak dikenal: ${code}`);
  }
}

export function toCsv(rows) {
  return '﻿' + rows.map((r) => r.map((c) => { const s = c == null ? '' : String(c); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(',')).join('\n');
}
export function toXlsx(rows, sheet) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = rows[0].map((_, i) => ({ wch: Math.min(40, Math.max(8, ...rows.slice(0, 200).map((r) => String(r[i] ?? '').length + 2))) }));
  XLSX.utils.book_append_sheet(wb, ws, sheet.slice(0, 30));
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
export function toPdf(rows, title, subtitle) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: rows[0].length > 6 ? 'landscape' : 'portrait', margin: 36 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    const W = doc.page.width - 72;
    const header = () => {
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#1E1919').text('ESCOLA SECUNDÁRIA CATÓLICA NOSSA SENHORA DE FÁTIMA (NOSSEF) RAILACO', 36, 36, { width: W });
      doc.font('Helvetica').fontSize(9).fillColor('#524A3E').text(`${title} · ${subtitle}`, { width: W });
      doc.moveTo(36, doc.y + 4).lineTo(36 + W, doc.y + 4).strokeColor('#1E1919').lineWidth(1).stroke();
      doc.y += 10;
    };
    header();
    const n = rows[0].length;
    const colW = W / n;
    const drawRow = (r, bold) => {
      const y = doc.y;
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(7.5).fillColor('#1E1919');
      const h = Math.max(...r.map((c) => doc.heightOfString(String(c ?? ''), { width: colW - 6 }))) + 6;
      if (y + h > doc.page.height - 48) { doc.addPage(); header(); return drawRow(r, bold); }
      if (bold) doc.rect(36, y, W, h).fill('#F7F5F2').fillColor('#1E1919');
      r.forEach((c, i) => doc.text(String(c ?? ''), 36 + i * colW + 3, y + 3, { width: colW - 6 }));
      doc.moveTo(36, y + h).lineTo(36 + W, y + h).strokeColor('#E6E4E0').lineWidth(0.5).stroke();
      doc.y = y + h;
    };
    drawRow(rows[0], true);
    rows.slice(1).forEach((r) => drawRow(r, false));
    doc.font('Helvetica').fontSize(7).fillColor('#8C8275').text(`Total baris: ${rows.length - 1}`, 36, doc.y + 8);
    doc.end();
  });
}
export async function render(format, rows, title, subtitle) {
  if (format === 'CSV') return { data: Buffer.from(toCsv(rows), 'utf8'), mime: 'text/csv; charset=utf-8', ext: 'csv' };
  if (format === 'PDF') return { data: await toPdf(rows, title, subtitle), mime: 'application/pdf', ext: 'pdf' };
  return { data: toXlsx(rows, title), mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: 'xlsx' };
}

import { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, History, Send, UploadCloud, X } from 'lucide-react';
import { useAuth, useData, useLookups, useToast } from '../context/AppContexts';
import { api, ApiError } from '../lib/api';
import { uploadFile } from '../lib/files';
import { fmtDateTime, num2, gradeFinal, situationOf, SCALE_MAX } from '../lib/format';
import type { PautaSubmission } from '../lib/types';
import { Alert, Badge, Button, cx, Field, Modal, Mono, Select, StatusPill, Tabs } from './ui';

export interface UploadValorOptions { classId?: string; subjectId?: string; trimester?: number }

interface ParsedRow { row: number; studentNo: string; name: string; tpc: number | null; t1: number | null; t2: number | null; ezame: number | null; observation: string; _errors: string[]; final: number | null }

const MAX_BYTES = 15 * 1024 * 1024;

/** Classes & subjects a user may submit grades for (object scope). */
export function useGradeScope() {
  const { db } = useData();
  const { user, can } = useAuth();
  return useMemo(() => {
    if (!db || !user) return [];
    const all = can('score.revise');
    return db.teachingAssignments.filter((a) =>
      all || a.teacherId === user.profileId || (user.roles.includes('HOMEROOM_TEACHER') && db.classes.find((c) => c.id === a.classId)?.homeroomTeacherId === user.profileId)
    );
  }, [db, user, can]);
}

function normalizeHeader(h: unknown) {
  return String(h ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}
function detectColumns(header: unknown[]) {
  const idx: Record<string, number> = {};
  header.forEach((raw, i) => {
    const h = normalizeHeader(raw);
    if (!h) return;
    if (idx.studentNo == null && /(n[ºo°]? ?estudante|nis|numer|student ?no|no\. ?induk|^n[ºo°]$|id estudante)/.test(h) && !/^no$/.test(h)) idx.studentNo = i;
    else if (idx.name == null && /(naran|nama|name|nome)/.test(h)) idx.name = i;
    else if (idx.tpc == null && /(tpc|trabalho|tugas)/.test(h)) idx.tpc = i;
    else if (idx.t1 == null && /(teste ?(parcial)? ?1|t1|teste i\b)/.test(h)) idx.t1 = i;
    else if (idx.t2 == null && /(teste ?(parcial)? ?2|t2|teste ii\b)/.test(h)) idx.t2 = i;
    else if (idx.ezame == null && /(ezame|exame|ujian|cau|exam)/.test(h)) idx.ezame = i;
    else if (idx.observation == null && /(observ|catatan|nota)/.test(h)) idx.observation = i;
  });
  return idx;
}
function toScore(v: unknown): { v: number | null; err?: string } {
  if (v === null || v === undefined || String(v).trim() === '') return { v: null };
  const n = Number(String(v).replace(',', '.'));
  if (Number.isNaN(n)) return { v: null, err: `"${v}" bukan angka` };
  if (n < 0 || n > SCALE_MAX) return { v: n, err: `${n} di luar skala 0–${SCALE_MAX}` };
  return { v: Math.round(n * 100) / 100 };
}

export default function UploadValorExcel({ open, onClose, options }: { open: boolean; onClose: () => void; options?: UploadValorOptions }) {
  const { db, reload } = useData();
  const { user } = useAuth();
  const { toast } = useToast();
  const L = useLookups();
  const scope = useGradeScope();
  const activeTri = db?.trimesters.find((t) => t.status === 'ACTIVE')?.number || 3;
  const [tab, setTab] = useState<'submit' | 'history'>('submit');
  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [trimester, setTrimester] = useState(activeTri);
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<PautaSubmission | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const classOptions = useMemo(() => [...new Set(scope.map((a) => a.classId))].map((id) => db!.classes.find((c) => c.id === id)!).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name)), [scope, db]);
  const subjectOptions = useMemo(() => scope.filter((a) => a.classId === classId).map((a) => db!.subjects.find((s) => s.id === a.subjectId)!).filter(Boolean), [scope, classId, db]);

  useEffect(() => {
    if (!open) return;
    setTab('submit'); setFile(null); setRows(null); setParseError(null); setReceipt(null); setSubmitError(null);
    // Default context: explicit option → own homeroom class → first own assignment → first in scope.
    const homeroom = db?.classes.find((x) => x.homeroomTeacherId === user?.profileId && classOptions.some((o) => o.id === x.id));
    const own = scope.find((a) => a.teacherId === user?.profileId && (!homeroom || a.classId === homeroom.id)) || scope.find((a) => a.teacherId === user?.profileId);
    const c = options?.classId || homeroom?.id || own?.classId || classOptions[0]?.id || '';
    setClassId(c);
    const s = options?.subjectId || scope.find((a) => a.classId === c && (a.teacherId === user?.profileId))?.subjectId || scope.find((a) => a.classId === c)?.subjectId || '';
    setSubjectId(s);
    setTrimester(options?.trimester || activeTri);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (classId && !subjectOptions.find((s) => s.id === subjectId)) setSubjectId(subjectOptions[0]?.id || '');
  }, [classId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!db) return null;
  const cls = L.classes.get(classId);
  const subj = L.subjects.get(subjectId);
  const students = db.students.filter((s) => s.classId === classId && s.status === 'ACTIVE').sort((a, b) => a.name.localeCompare(b.name));
  const tg = db.termGrades.find((t) => t.classId === classId && t.subjectId === subjectId && t.trimester === trimester);
  const locked = tg?.status === 'FINALIZED';
  const myHistory = db.pautaSubmissions.filter((p) => p.teacherId === user?.profileId || scope.some((a) => a.classId === p.classId && a.subjectId === p.subjectId));

  function downloadModelo() {
    if (!cls || !subj) return;
    const teacher = L.teachers.get(scope.find((a) => a.classId === classId && a.subjectId === subjectId)?.teacherId || '')?.name || user?.name;
    const aoa: (string | number | null | { f: string })[][] = [
      ['ESCOLA SECUNDÁRIA CATÓLICA NOSSA SENHORA DE FÁTIMA (NOSSEF) RAILACO'],
      ['PAUTA DE CLASSIFICAÇÃO / VALOR — Ano Letivo 2026'],
      [`Turma: ${cls.name}`, '', `Disciplina: ${subj.name} (${subj.code})`, '', '', `Trimestre: ${trimester}º (CAU ${trimester})`],
      [`Professór: ${teacher}`, '', '', '', '', 'Escala 0 - 10 | TPC 20% · Teste 1 25% · Teste 2 25% · Ezame 30% | Reprovado 0 - 5,00 · Aprovado > 5,00'],
      [],
      ['No', 'Nº Estudante', 'Naran Kompletu', 'TPC (20%)', 'Teste Parcial 1 (25%)', 'Teste Parcial 2 (25%)', 'Ezame Trimestral (30%)', 'Média Final', 'Situasaun', 'Observasaun'],
    ];
    students.forEach((s, i) => {
      const r = 7 + i;
      const sc = db!.scores.find((x) => x.studentId === s.id && x.subjectId === subjectId && x.trimester === trimester);
      aoa.push([
        i + 1, s.studentNo, s.name, sc?.tpc ?? null, sc?.t1 ?? null, sc?.t2 ?? null, sc?.ezame ?? null,
        { f: `IF(COUNT(D${r}:G${r})=4,ROUND(D${r}*0.2+E${r}*0.25+F${r}*0.25+G${r}*0.3,2),"")` },
        { f: `IF(H${r}="","",IF(H${r}>5,"Aprovado","Reprovado"))` },
        sc?.observation || '',
      ]);
    });
    const ws = XLSX.utils.aoa_to_sheet(aoa.map((row) => row.map((c) => (c && typeof c === 'object' ? null : c))));
    aoa.forEach((row, ri) => row.forEach((c, ci) => { if (c && typeof c === 'object') ws[XLSX.utils.encode_cell({ r: ri, c: ci })] = { t: 'n', f: c.f }; }));
    ws['!cols'] = [{ wch: 5 }, { wch: 16 }, { wch: 34 }, { wch: 11 }, { wch: 13 }, { wch: 13 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 28 }];
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 9 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: 9 } }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pauta Valor');
    XLSX.writeFile(wb, `Modelo_Pauta_${subj.code}_${cls.name.replace(/[º\s]/g, '')}_T${trimester}.xlsx`);
    toast('Modelo Excel diunduh — terisi nama dan nomor siswa.', 'ok');
  }

  async function handleFile(f: File) {
    setParseError(null); setRows(null); setReceipt(null); setSubmitError(null);
    if (!/\.(xlsx|xls|csv)$/i.test(f.name)) { setParseError('Format tidak didukung. Gunakan .xlsx, .xls, atau .csv.'); return; }
    if (f.size > MAX_BYTES) { setParseError('Ukuran file melebihi 15 MB.'); return; }
    setFile(f);
    try {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: '' });
      let headerRow = -1;
      let cols: Record<string, number> = {};
      for (let i = 0; i < Math.min(aoa.length, 25); i++) {
        const c = detectColumns(aoa[i]);
        const scoreCols = ['tpc', 't1', 't2', 'ezame'].filter((k) => c[k] != null).length;
        if ((c.studentNo != null || c.name != null) && scoreCols >= 2) { headerRow = i; cols = c; break; }
      }
      if (headerRow < 0) { setParseError('Baris header tidak ditemukan. Pastikan ada kolom Nº Estudante / Naran, TPC, Teste 1, Teste 2, Ezame.'); return; }
      const parsed: ParsedRow[] = [];
      for (let i = headerRow + 1; i < aoa.length; i++) {
        const r = aoa[i];
        const sno = cols.studentNo != null ? String(r[cols.studentNo] ?? '').trim() : '';
        const nm = cols.name != null ? String(r[cols.name] ?? '').trim() : '';
        if (!sno && !nm) continue;
        const errs: string[] = [];
        const get = (k: string) => { if (cols[k] == null) return null; const s = toScore(r[cols[k]]); if (s.err) errs.push(`${k.toUpperCase()}: ${s.err}`); return s.v; };
        const row: ParsedRow = { row: i + 1, studentNo: sno, name: nm, tpc: get('tpc'), t1: get('t1'), t2: get('t2'), ezame: get('ezame'), observation: cols.observation != null ? String(r[cols.observation] ?? '') : '', _errors: errs, final: null };
        const stu = students.find((s) => (sno && s.studentNo === sno) || (!sno && s.name.toLowerCase() === nm.toLowerCase()));
        if (!stu) errs.push('Siswa tidak terdaftar di rombel ini');
        else { row.studentNo = stu.studentNo; row.name = stu.name; }
        if ([row.tpc, row.t1, row.t2, row.ezame].every((v) => v != null) && !errs.length) row.final = gradeFinal(row.tpc!, row.t1!, row.t2!, row.ezame!);
        parsed.push(row);
      }
      if (!parsed.length) { setParseError('File tidak berisi baris data siswa.'); return; }
      setRows(parsed);
    } catch {
      setParseError('File tidak dapat dibaca. Pastikan file Excel/CSV tidak rusak.');
    }
  }

  async function submit() {
    if (!rows) return;
    setBusy(true); setSubmitError(null);
    try {
      // Keep the original Excel/CSV in storage so the submission can be audited later.
      const stored = file ? await uploadFile(file, { category: 'pauta' }) : null;
      const r = await api<{ submission: PautaSubmission }>('POST', '/api/pauta/submit', {
        classId, subjectId, trimester, fileName: file?.name, fileId: stored?.id,
        rows: rows.map((x) => ({ row: x.row, studentNo: x.studentNo, tpc: x.tpc, t1: x.t1, t2: x.t2, ezame: x.ezame, observation: x.observation, _errors: x._errors })),
      });
      setReceipt(r.submission);
      await reload();
    } catch (e) {
      const err = e as ApiError;
      setSubmitError(`${err.code}: ${err.message}`);
    } finally { setBusy(false); }
  }

  const valid = rows?.filter((r) => !r._errors.length).length || 0;
  const invalid = (rows?.length || 0) - valid;
  const step = receipt ? 4 : rows ? 3 : file ? 2 : 1;

  return (
    <Modal open={open} onClose={onClose} size="xl" title="Submete Pauta Valor via EXCEL"
      footer={tab === 'submit' && !receipt ? (
        <>
          <Button onClick={onClose}>Batal</Button>
          <Button variant="primary" icon={Send} disabled={!rows || !valid || busy || locked} onClick={submit}>
            {busy ? 'Mengirim...' : `Kirim ${valid} Baris ke Diretora`}
          </Button>
        </>
      ) : <Button onClick={onClose}>Tutup</Button>}>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'submit', label: 'Submete Pauta', icon: UploadCloud }, { id: 'history', label: 'Istóriku Submisaun', icon: History, count: myHistory.length }]} />
      {tab === 'history' ? (
        <div className="border border-line rounded-lg overflow-hidden">
          {myHistory.length ? myHistory.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-line last:border-0">
              <Mono className="font-semibold">{p.protocol}</Mono>
              <span className="text-sm">{L.subjects.get(p.subjectId)?.name} · {L.classes.get(p.classId)?.name} · T{p.trimester}</span>
              <span className="text-xs text-ink2">{fmtDateTime(p.submittedAt)}</span>
              <span className="ml-auto"><StatusPill status={p.status} /></span>
              {p.reviewNote && <div className="w-full text-xs text-ink2">Catatan: {p.reviewNote}</div>}
            </div>
          )) : <div className="p-6 text-sm text-ink2">Belum ada submisi.</div>}
        </div>
      ) : receipt ? (
        <div className="max-w-xl mx-auto py-4">
          <div className="border border-line rounded-lg overflow-hidden">
            <div className="bg-canvas px-5 py-4 border-b border-line flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-ok" strokeWidth={1.5} />
              <div>
                <div className="font-display font-semibold text-lg">Pauta Valor berhasil dikirim</div>
                <div className="text-xs text-ink2">Bukti Protokol Resmi — simpan nomor ini sebagai referensi</div>
              </div>
            </div>
            <div className="px-5 py-5">
              <div className="text-xs text-ink2">Nomor Protokol</div>
              <div className="font-mono text-2xl font-semibold tracking-tight mt-1">{receipt.protocol}</div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div><div className="text-xs text-ink2">Rombel</div>{cls?.name}</div>
                <div><div className="text-xs text-ink2">Mata Pelajaran</div>{subj?.name}</div>
                <div><div className="text-xs text-ink2">Trimestre</div>{receipt.trimester}º (CAU {receipt.trimester})</div>
                <div><div className="text-xs text-ink2">Baris diterima</div><Mono>{receipt.rowsValid}/{receipt.rowsTotal}</Mono></div>
                <div><div className="text-xs text-ink2">Dikirim</div>{fmtDateTime(receipt.submittedAt)}</div>
                <div><div className="text-xs text-ink2">Status</div><StatusPill status={receipt.status} /></div>
              </div>
              <div className="mt-5 pt-4 border-t border-line text-sm">
                <div className="text-xs text-ink2 mb-1.5">Ditujukan kepada</div>
                <div>Prof. Dra. Cristina Amaral — <span className="text-ink2">Diretora Geral da Escola</span></div>
                <div>Ir. Maria Gorete Martins — <span className="text-ink2">Vise-Diretora Pedagójika</span></div>
              </div>
            </div>
          </div>
          <div className="flex justify-center gap-2 mt-4">
            <Button onClick={() => { setReceipt(null); setRows(null); setFile(null); }}>Kirim Pauta Lain</Button>
            <Button onClick={() => window.print()}>Cetak Bukti</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <ol className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            {['Download Modelo', 'Unggah File', 'Pratinjau & Validasi', 'Bukti Protokol'].map((s, i) => (
              <li key={s} className={cx('flex items-center gap-2 px-3 h-9 rounded-md border', step > i + 1 ? 'border-line bg-canvas text-ink2' : step === i + 1 ? 'border-accent bg-selected text-accent font-semibold' : 'border-line text-muted')}>
                <Mono className="text-[11px]">{String(i + 1).padStart(2, '0')}</Mono>{s}
              </li>
            ))}
          </ol>
          <div className="grid md:grid-cols-4 gap-3">
            <Field label="Rombel (Turma)">
              <Select value={classId} onChange={(e) => { setClassId(e.target.value); setRows(null); setFile(null); }}>
                {classOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Mata Pelajaran (Disciplina)">
              <Select value={subjectId} onChange={(e) => { setSubjectId(e.target.value); setRows(null); setFile(null); }}>
                {subjectOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
            <Field label="Trimestre">
              <Select value={trimester} onChange={(e) => setTrimester(Number(e.target.value))}>
                {[1, 2, 3].map((n) => <option key={n} value={n}>{n}º Trimestre (CAU {n})</option>)}
              </Select>
            </Field>
            <div className="flex items-end">
              <Button icon={Download} className="w-full h-10" onClick={downloadModelo} disabled={!cls || !subj}>Download Modelo Excel</Button>
            </div>
          </div>
          {locked && <Alert tone="warn" title="TERM_GRADE_LOCKED">Nilai {subj?.name} {cls?.name} Trimestre {trimester} sudah FINALIZED. Pengiriman diblokir sampai dibuka kembali oleh Vise-Diretora.</Alert>}

          {!rows && (
            <div
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
              onClick={() => inputRef.current?.click()}
              className={cx('cursor-pointer border-2 border-dashed rounded-lg py-12 px-6 text-center transition-colors', drag ? 'border-accent bg-selected' : 'border-line-strong bg-canvas hover:bg-hover')}
            >
              <UploadCloud className="w-8 h-8 mx-auto text-ink2" strokeWidth={1.5} />
              <div className="mt-3 text-sm font-medium text-ink">Tarik & lepas file pauta di sini, atau klik untuk memilih</div>
              <div className="mt-1 text-xs text-muted">.xlsx · .xls · .csv — maks 15 MB · kolom: Nº Estudante, Naran, TPC, Teste 1, Teste 2, Ezame, Observasaun</div>
              <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
            </div>
          )}
          {parseError && <Alert tone="bad" title="File tidak valid">{parseError}</Alert>}
          {submitError && <Alert tone="bad" title="Pengiriman gagal">{submitError}</Alert>}

          {rows && (
            <div>
              <div className="flex flex-wrap items-center gap-3 mb-3">
                <div className="flex items-center gap-2 px-3 h-9 rounded-md border border-line bg-canvas text-sm min-w-0">
                  <FileSpreadsheet className="w-4 h-4 text-ok shrink-0" strokeWidth={1.5} />
                  <span className="truncate max-w-[220px]">{file?.name}</span>
                  <Mono className="text-xs text-muted">{Math.ceil((file?.size || 0) / 1024)} KB</Mono>
                  <button onClick={() => { setRows(null); setFile(null); }} className="text-muted hover:text-ink"><X className="w-4 h-4" strokeWidth={1.5} /></button>
                </div>
                <Badge tone="neutral">Total <Mono>{rows.length}</Mono></Badge>
                <Badge tone="ok">Valid <Mono>{valid}</Mono></Badge>
                {invalid > 0 && <Badge tone="bad">Error <Mono>{invalid}</Mono></Badge>}
                <span className="text-xs text-ink2 ml-auto">Baris error tidak akan disimpan.</span>
              </div>
              <div className="border border-line rounded-lg overflow-auto max-h-[42vh] scroll-thin">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-canvas text-xs uppercase tracking-wider text-ink2">
                      {['Baris', 'Nº Estudante', 'Naran', 'TPC', 'T1', 'T2', 'Ezame', 'Média', 'Situasaun', 'Validasi'].map((h) => <th key={h} className="sticky top-0 bg-canvas text-left px-3 h-9 border-b border-line font-semibold whitespace-nowrap">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.row} className={r._errors.length ? 'bg-bad-bg/50' : ''}>
                        <td className="px-3 py-2 border-b border-line font-mono text-xs text-muted">{r.row}</td>
                        <td className="px-3 py-2 border-b border-line font-mono text-xs">{r.studentNo || '—'}</td>
                        <td className="px-3 py-2 border-b border-line whitespace-nowrap">{r.name}</td>
                        {(['tpc', 't1', 't2', 'ezame'] as const).map((k) => <td key={k} className="px-3 py-2 border-b border-line font-mono text-right">{num2(r[k])}</td>)}
                        <td className="px-3 py-2 border-b border-line font-mono font-semibold text-right">{num2(r.final)}</td>
                        <td className="px-3 py-2 border-b border-line"><StatusPill status={situationOf(r.final)} /></td>
                        <td className="px-3 py-2 border-b border-line text-xs">
                          {r._errors.length ? <span className="inline-flex items-start gap-1 text-bad"><AlertCircle className="w-3.5 h-3.5 mt-px shrink-0" strokeWidth={1.5} />{r._errors.join('; ')}</span> : <span className="text-ok inline-flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.5} />OK</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 text-xs text-ink2">
                Nilai akhir dihitung otoritatif oleh server: Média = TPC×0.20 + Teste 1×0.25 + Teste 2×0.25 + Ezame×0.30 · skala 0–10 · 0–5,00 Reprovado · di atas 5,00 Aprovado.
                Pauta akan dikirim ke <b>Diretora Geral</b> dan <b>Vise-Diretora Pedagójika</b> dengan status <Mono>PENDING_DIRECTOR_REVIEW</Mono>.
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

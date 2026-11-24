import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { CheckCircle2, Download, FileSpreadsheet, Lock, RotateCcw, Save, Undo2 } from 'lucide-react';
import { useAuth, useDB, useLookups, useMutation } from '../context/AppContexts';
import { useUploadValor } from '../components/AppShell';
import { useGradeScope } from '../components/UploadValorExcel';
import { Alert, Badge, Button, Card, cx, Drawer, EmptyState, Field, KV, Mono, PageHeader, ReasonDialog, Select, StatusPill, Table, Tabs, Td, Textarea, Th, Tr } from '../components/ui';
import { fmtDateTime, gradeFinal, num2, passed, SCALE_MAX, situationOf } from '../lib/format';
import type { PautaSubmission, Score } from '../lib/types';
import { fileUrl } from '../lib/files';

type Field_ = 'tpc' | 't1' | 't2' | 'ezame';
const COLS: { k: Field_; label: string; w: string }[] = [
  { k: 'tpc', label: 'TPC / Tugas', w: '20%' }, { k: 't1', label: 'Teste 1', w: '25%' }, { k: 't2', label: 'Teste 2', w: '25%' },
  { k: 'ezame', label: 'Ezame', w: '30%' },
];

function Gradebook() {
  const db = useDB();
  const L = useLookups();
  const { can, user } = useAuth();
  const mutate = useMutation();
  const openUpload = useUploadValor();
  const scope = useGradeScope();
  const [params] = useSearchParams();
  const classes = useMemo(() => [...new Set(scope.map((a) => a.classId))].map((id) => L.classes.get(id)!).sort((a, b) => a.name.localeCompare(b.name)), [scope, L]);
  const own = scope.find((a) => a.teacherId === user?.profileId);
  const [classId, setClassId] = useState(params.get('class') && classes.some((c) => c.id === params.get('class')) ? params.get('class')! : own?.classId || classes[0]?.id || '');
  const subjects = scope.filter((a) => a.classId === classId).map((a) => L.subjects.get(a.subjectId)!);
  const [subjectId, setSubjectId] = useState(own && own.classId === classId ? own.subjectId : subjects[0]?.id || '');
  const [tri, setTri] = useState(db.trimesters.find((t) => t.status === 'ACTIVE')?.number || 3);
  const [edits, setEdits] = useState<Record<string, Partial<Record<Field_, string>>>>({});
  const [focus, setFocus] = useState<string | null>(null);
  const [reopen, setReopen] = useState(false);
  useEffect(() => { if (!subjects.find((s) => s.id === subjectId)) setSubjectId(subjects[0]?.id || ''); }, [classId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setEdits({}), [classId, subjectId, tri]);

  if (!classes.length) return <EmptyState title="Anda belum memiliki penugasan mengajar." />;
  const students = db.students.filter((s) => s.classId === classId && s.status === 'ACTIVE').sort((a, b) => a.name.localeCompare(b.name));
  const tg = db.termGrades.find((t) => t.classId === classId && t.subjectId === subjectId && t.trimester === tri);
  const locked = tg?.status === 'FINALIZED';
  const scoreOf = (sid: string) => db.scores.find((x) => x.studentId === sid && x.subjectId === subjectId && x.trimester === tri);
  const valueOf = (sid: string, k: Field_): string => {
    const e = edits[sid]?.[k];
    if (e !== undefined) return e;
    const v = scoreOf(sid)?.[k];
    return v == null ? '' : String(v);
  };
  const invalid = (v: string) => v !== '' && (Number.isNaN(Number(v)) || Number(v) < 0 || Number(v) > SCALE_MAX);
  const dirtyCount = Object.values(edits).reduce((n, e) => n + Object.keys(e).length, 0);
  const anyInvalid = Object.values(edits).some((e) => Object.values(e).some((v) => invalid(v!)));
  const graded = students.filter((s) => { const sc = scoreOf(s.id); return sc && sc.final != null; }).length;
  const finals = students.map((s) => scoreOf(s.id)?.final).filter((x): x is number => x != null);
  const avg = finals.length ? finals.reduce((a, b) => a + b, 0) / finals.length : null;

  async function save() {
    const rows = Object.entries(edits).map(([studentId, e]) => {
      const r: Record<string, unknown> = { studentId };
      Object.entries(e).forEach(([k, v]) => (r[k] = v === '' ? null : Number(v)));
      return r;
    });
    const ok = await mutate('POST', '/api/grades/scores', { classId, subjectId, trimester: tri, rows }, `${rows.length} baris nilai tersimpan. Média dihitung server.`);
    if (ok) setEdits({});
  }
  function exportXlsx() {
    const aoa = [['No', 'Nº Estudante', 'Naran', 'TPC', 'Teste 1', 'Teste 2', 'Ezame', 'Média Final', 'Situasaun'], ...students.map((s, i) => { const sc = scoreOf(s.id); return [i + 1, s.studentNo, s.name, sc?.tpc, sc?.t1, sc?.t2, sc?.ezame, sc?.final, sc?.situation]; })];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Caderneta');
    XLSX.writeFile(wb, `Caderneta_${L.subjects.get(subjectId)?.code}_${L.classes.get(classId)?.name.replace(/[º\s]/g, '')}_T${tri}.xlsx`);
  }

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        <Select value="2026" disabled className="h-9"><option>Tahun Ajaran 2026</option></Select>
        <Select value={tri} onChange={(e) => setTri(Number(e.target.value))} className="h-9">{[1, 2, 3].map((n) => <option key={n} value={n}>{n}º Trimestre (CAU {n})</option>)}</Select>
        <Select value={classId} onChange={(e) => setClassId(e.target.value)} className="h-9">{classes.map((c) => <option key={c.id} value={c.id}>Rombel: {c.name}</option>)}</Select>
        <Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className="h-9">{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
      </div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Badge tone={graded === students.length ? 'ok' : 'warn'}><Mono>{graded}/{students.length}</Mono> Siswa Dinilai</Badge>
        <Badge tone="ok" dot>Skema Bobot: Total 100% (ACTIVE)</Badge>
        <Badge tone={locked ? 'ok' : 'neutral'} dot>Status Nilai Akhir: {tg?.status || 'DRAFT'}</Badge>
        {avg != null && <Badge>Rata-rata kelas <Mono>{num2(avg)}</Mono></Badge>}
        <div className="flex-1" />
        {dirtyCount > 0 && <Button size="sm" variant="ghost" icon={Undo2} onClick={() => setEdits({})}>Batalkan ({dirtyCount})</Button>}
        {dirtyCount > 0 && <Button size="sm" variant="primary" icon={Save} disabled={anyInvalid} onClick={save}>Simpan Nilai</Button>}
        <Button size="sm" icon={Download} onClick={exportXlsx}>Export</Button>
        <Button size="sm" icon={FileSpreadsheet} variant={dirtyCount ? 'secondary' : 'primary'} onClick={() => openUpload({ classId, subjectId, trimester: tri })}>Upload Valor Excel</Button>
        {!locked ? (
          <Button size="sm" variant="dark" icon={Lock} disabled={graded < students.length || dirtyCount > 0} onClick={() => mutate('POST', '/api/grades/finalize', { classId, subjectId, trimester: tri }, 'TermGrade FINALIZED dan terkunci.')}>Finalisasi Nilai Trimestre</Button>
        ) : can('grade.reopen') && <Button size="sm" icon={RotateCcw} onClick={() => setReopen(true)}>Buka Kembali (Reopen)</Button>}
      </div>
      {locked && <div className="mb-3"><Alert tone="ok" icon={Lock} title="Nilai terkunci (FINALIZED)">Difinalisasi {fmtDateTime(tg?.finalizedAt)}. Perubahan hanya melalui reopen oleh Vise-Diretora dengan alasan (tercatat di Audit Log).</Alert></div>}
      {anyInvalid && <div className="mb-3"><Alert tone="bad" title="ASSESSMENT_SCORE_OUT_OF_RANGE">Nilai harus berada pada skala 0 – 10.</Alert></div>}
      <div className="bg-white border border-line rounded-lg overflow-auto max-h-[65vh] scroll-thin">
        <table className="border-collapse text-sm min-w-[980px] w-full">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-20 bg-canvas border-b border-r border-line h-12 w-10 min-w-10 max-w-10 text-xs text-ink2 font-semibold">No</th>
              <th className="sticky left-10 top-0 z-20 bg-canvas border-b border-r border-line px-3 text-left text-xs uppercase tracking-wider text-ink2 font-semibold w-36 min-w-36 max-w-36">NIS</th>
              <th className="sticky left-[11.5rem] top-0 z-20 bg-canvas border-b border-r border-line px-3 text-left text-xs uppercase tracking-wider text-ink2 font-semibold min-w-[220px]">Nama Siswa</th>
              {COLS.map((c) => (
                <th key={c.k} className="sticky top-0 z-10 bg-canvas border-b border-r border-line px-2 text-xs text-ink2 font-semibold w-[104px] min-w-[104px]">
                  <div className="uppercase tracking-wide leading-tight">{c.label}</div>
                  <div className="font-mono font-normal text-[10px] text-muted flex items-center justify-center gap-1">{c.w}{c.k === 'ezame' && <Badge tone="dark" className="h-4 text-[9px] px-1">CAU {tri}</Badge>}</div>
                </th>
              ))}
              <th className="sticky top-0 z-10 bg-canvas border-b border-r border-line px-2 text-xs text-ink2 font-semibold w-[110px] uppercase tracking-wider">Média Final<div className="font-mono font-normal text-[10px] text-muted normal-case">server</div></th>
              <th className="sticky top-0 z-10 bg-canvas border-b border-line px-2 text-xs text-ink2 font-semibold uppercase tracking-wider">Situasaun</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s, i) => {
              const sc = scoreOf(s.id) as Score | undefined;
              const dirty = !!edits[s.id];
              const vals = (['tpc', 't1', 't2', 'ezame'] as Field_[]).map((k) => valueOf(s.id, k));
              const preview = dirty && vals.every((v) => v !== '' && !invalid(v)) ? gradeFinal(+vals[0], +vals[1], +vals[2], +vals[3]) : null;
              const final = dirty ? preview : sc?.final ?? null;
              return (
                <tr key={s.id} className="hover:bg-hover/60 group">
                  <td className="sticky left-0 z-[5] bg-white group-hover:bg-hover border-b border-r border-line text-center font-mono text-xs text-ink2 w-10 min-w-10 max-w-10">{i + 1}</td>
                  <td className="sticky left-10 z-[5] bg-white group-hover:bg-hover border-b border-r border-line px-3 font-mono text-xs w-36 min-w-36 max-w-36">{s.studentNo}</td>
                  <td className="sticky left-[11.5rem] z-[5] bg-white group-hover:bg-hover border-b border-r border-line px-3 whitespace-nowrap">{s.name}</td>
                  {COLS.map((c) => {
                    const v = valueOf(s.id, c.k);
                    const isDirty = edits[s.id]?.[c.k] !== undefined;
                    const bad = invalid(v);
                    const key = `${s.id}-${c.k}`;
                    return (
                      <td key={c.k} className={cx('relative border-b border-r border-line p-0', bad && 'outline-2 -outline-offset-2 outline-bad', focus === key && !bad && 'outline-2 -outline-offset-2 outline-accent')}>
                        {isDirty && <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-warn" />}
                        <input
                          disabled={locked}
                          value={v}
                          inputMode="decimal"
                          onFocus={() => setFocus(key)}
                          onBlur={() => setFocus(null)}
                          onChange={(e) => setEdits((x) => ({ ...x, [s.id]: { ...x[s.id], [c.k]: e.target.value.replace(',', '.') } }))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === 'ArrowDown') { (document.querySelector(`[data-cell="${students[i + 1]?.id}-${c.k}"]`) as HTMLInputElement)?.focus(); e.preventDefault(); }
                            if (e.key === 'ArrowUp') { (document.querySelector(`[data-cell="${students[i - 1]?.id}-${c.k}"]`) as HTMLInputElement)?.focus(); e.preventDefault(); }
                          }}
                          data-cell={key}
                          className="w-full h-10 px-2 text-right font-mono text-sm bg-transparent outline-none disabled:text-ink2 min-h-[44px] md:min-h-0"
                        />
                      </td>
                    );
                  })}
                  <td className="border-b border-r border-line px-3 text-right font-mono font-bold">{num2(final)}{dirty && preview != null && <span className="block text-[9px] font-normal text-muted">pratinjau</span>}</td>
                  <td className="border-b border-line px-2"><StatusPill status={situationOf(final)} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="text-xs text-ink2 mt-2">Média = TPC×0.20 + Teste 1×0.25 + Teste 2×0.25 + Ezame×0.30 · skala 0–10 · 0–5,00 Reprovado · di atas 5,00 Aprovado · Enter/↓ pindah baris.</div>
      <ReasonDialog open={reopen} onClose={() => setReopen(false)} title="Buka Kembali Nilai Trimestre" confirmLabel="Reopen" danger
        description={<>Status TermGrade akan kembali ke <Mono>DRAFT</Mono>. Aksi ini dicatat sebagai <Mono>TERM_GRADE_REOPENED</Mono>.</>}
        onConfirm={(reason) => { mutate('POST', '/api/grades/finalize', { classId, subjectId, trimester: tri, reopen: true, reason }, 'TermGrade dibuka kembali.'); }} />
    </>
  );
}

function Submissions() {
  const db = useDB();
  const L = useLookups();
  const { can, user } = useAuth();
  const mutate = useMutation();
  const [open, setOpen] = useState<PautaSubmission | null>(null);
  const [note, setNote] = useState('');
  const [filter, setFilter] = useState('');
  const canReview = can('grade.review');
  const rows = db.pautaSubmissions.filter((p) => (canReview || p.teacherId === user?.profileId) && (!filter || p.status === filter));
  return (
    <>
      <div className="flex flex-wrap gap-2 mb-3">
        {['', 'PENDING_DIRECTOR_REVIEW', 'APPROVED', 'RETURNED_FOR_REVISION'].map((s) => (
          <button key={s} onClick={() => setFilter(s)} className={cx('h-8 px-3 rounded-full text-xs font-medium border', filter === s ? 'bg-ink text-white border-ink' : 'bg-white border-line text-ink2')}>{s ? s.replace(/_/g, ' ') : 'Semua'} <Mono className="opacity-70 ml-1">{db.pautaSubmissions.filter((p) => !s || p.status === s).length}</Mono></button>
        ))}
      </div>
      <div className="bg-white border border-line rounded-lg overflow-hidden">
        {rows.length ? (
          <Table>
            <thead><tr><Th>Nomor Protokol</Th><Th>Professór</Th><Th>Disciplina & Turma</Th><Th>Trimestre</Th><Th>File</Th><Th align="right">Baris</Th><Th>Dikirim</Th><Th>Status</Th></tr></thead>
            <tbody>
              {rows.map((p) => (
                <Tr key={p.id} onClick={() => { setOpen(p); setNote(p.reviewNote); }}>
                  <Td mono className="font-semibold">{p.protocol}</Td>
                  <Td className="whitespace-nowrap">{L.teachers.get(p.teacherId)?.name}</Td>
                  <Td>{L.subjects.get(p.subjectId)?.name}<div className="text-xs text-ink2">{L.classes.get(p.classId)?.name}</div></Td>
                  <Td>{p.trimester}º (CAU {p.trimester})</Td>
                  <Td className="text-xs text-ink2 max-w-[180px] truncate">{p.fileName}</Td>
                  <Td align="right" mono>{p.rowsValid}/{p.rowsTotal}</Td>
                  <Td className="text-xs whitespace-nowrap">{fmtDateTime(p.submittedAt)}</Td>
                  <Td><StatusPill status={p.status} /></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        ) : <EmptyState title="Belum ada submisi pauta." />}
      </div>
      {open && (
        <Drawer open onClose={() => setOpen(null)} title={<Mono>{open.protocol}</Mono>} subtitle="Tabel Pauta Guru Excel — Verifikasi Pimpinan" width={460}
          footer={canReview && open.status === 'PENDING_DIRECTOR_REVIEW' ? (
            <>
              <Button variant="danger" disabled={!note.trim()} onClick={async () => { await mutate('POST', `/api/pauta/${open.id}/review`, { status: 'RETURNED_FOR_REVISION', note }, 'Pauta dikembalikan untuk revisi.'); setOpen(null); }}>Kembalikan untuk Revisi</Button>
              <Button variant="dark" icon={CheckCircle2} onClick={async () => { await mutate('POST', `/api/pauta/${open.id}/review`, { status: 'APPROVED', note }, 'Pauta disetujui.'); setOpen(null); }}>Setujui Pauta</Button>
            </>
          ) : undefined}>
          <StatusPill status={open.status} />
          <div className="mt-4">
            <KV k="Professór" v={L.teachers.get(open.teacherId)?.name} />
            <KV k="Disciplina" v={L.subjects.get(open.subjectId)?.name} />
            <KV k="Turma" v={L.classes.get(open.classId)?.name} />
            <KV k="Trimestre" v={`${open.trimester}º (CAU ${open.trimester})`} />
            <KV k="File" v={open.fileId ? <a href={fileUrl(open.fileId, true)} className="text-accent underline underline-offset-2">{open.fileName}</a> : open.fileName} />
            <KV k="Baris valid" v={`${open.rowsValid}/${open.rowsTotal}`} mono />
            <KV k="Dikirim" v={fmtDateTime(open.submittedAt)} />
            <KV k="Ditujukan" v={<>Diretora Geral da Escola<br />Vise-Diretora Pedagójika</>} />
            {open.reviewedBy && <KV k="Direview oleh" v={open.reviewedBy} />}
          </div>
          <div className="mt-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-ink2 mb-2">Ringkasan Nilai</div>
            <PautaSummary p={open} />
          </div>
          {canReview && open.status === 'PENDING_DIRECTOR_REVIEW' && (
            <Field label="Catatan review (wajib untuk revisi)" className="mt-4"><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          )}
          {open.reviewNote && open.status !== 'PENDING_DIRECTOR_REVIEW' && <div className="mt-4"><Alert tone={open.status === 'APPROVED' ? 'ok' : 'bad'} title="Catatan review">{open.reviewNote}</Alert></div>}
        </Drawer>
      )}
    </>
  );
}

function PautaSummary({ p }: { p: PautaSubmission }) {
  const db = useDB();
  const sc = db.scores.filter((x) => x.classId === p.classId && x.subjectId === p.subjectId && x.trimester === p.trimester);
  const c = { APROVADO: 0, REPROVADO: 0 } as Record<string, number>;
  sc.forEach((x) => x.situation && c[x.situation]++);
  const f = sc.map((x) => x.final).filter((x): x is number => x != null);
  return (
    <div className="grid grid-cols-3 border border-line rounded-md divide-x divide-line text-center">
      <div className="py-2"><Mono className="font-semibold">{f.length ? num2(f.reduce((a, b) => a + b, 0) / f.length) : '—'}</Mono><div className="text-[10px] text-ink2">Rata-rata</div></div>
      <div className="py-2"><Mono className="font-semibold text-ok">{c.APROVADO}</Mono><div className="text-[10px] text-ink2">Aprovado</div></div>
      <div className="py-2"><Mono className="font-semibold text-bad">{c.REPROVADO}</Mono><div className="text-[10px] text-ink2">Reprovado</div></div>
    </div>
  );
}

function Recap() {
  const db = useDB();
  const L = useLookups();
  const [classId, setClassId] = useState(db.classes[0].id);
  const [tri, setTri] = useState(2);
  const subjects = db.teachingAssignments.filter((a) => a.classId === classId).map((a) => L.subjects.get(a.subjectId)!);
  const students = db.students.filter((s) => s.classId === classId);
  const rows = students.map((s) => {
    const vals = subjects.map((sub) => db.scores.find((x) => x.studentId === s.id && x.subjectId === sub.id && x.trimester === tri)?.final ?? null);
    const f = vals.filter((v): v is number => v != null);
    const avg = f.length ? f.reduce((a, b) => a + b, 0) / f.length : null;
    return { s, vals, avg, failed: vals.filter((v) => v != null && !passed(v)).length };
  }).sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0));
  const colAvg = subjects.map((_, i) => { const f = rows.map((r) => r.vals[i]).filter((v): v is number => v != null); return f.length ? f.reduce((a, b) => a + b, 0) / f.length : null; });
  function exportXlsx() {
    const aoa = [['Rank', 'NIS', 'Naran', ...subjects.map((s) => s.code), 'Média', 'Reprovado'], ...rows.map((r, i) => [i + 1, r.s.studentNo, r.s.name, ...r.vals, r.avg ? Number(r.avg.toFixed(2)) : null, r.failed]), ['', '', 'Média Turma', ...colAvg.map((v) => (v ? Number(v.toFixed(2)) : null))]];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Rekapitulasaun');
    XLSX.writeFile(wb, `Rekapitulasaun_Valor_${L.classes.get(classId)?.name.replace(/[º\s]/g, '')}_T${tri}.xlsx`);
  }
  return (
    <>
      <div className="flex flex-wrap gap-2 mb-3">
        <Select value={classId} onChange={(e) => setClassId(e.target.value)} className="h-9 w-40">{db.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        <Select value={tri} onChange={(e) => setTri(Number(e.target.value))} className="h-9 w-52">{[1, 2, 3].map((n) => <option key={n} value={n}>{n}º Trimestre (CAU {n})</option>)}</Select>
        <div className="flex-1" />
        <Button icon={Download} onClick={exportXlsx}>Export Excel</Button>
      </div>
      <div className="bg-white border border-line rounded-lg overflow-auto max-h-[68vh] scroll-thin">
        <table className="border-collapse text-xs">
          <thead>
            <tr>
              {['Rank', 'NIS', 'Naran'].map((h, i) => <th key={h} className={cx('sticky top-0 z-20 bg-canvas border-b border-r border-line px-2 h-10 text-left font-semibold uppercase tracking-wider text-ink2', i === 2 && 'left-0 z-30 min-w-[200px]')}>{h}</th>)}
              {subjects.map((s) => <th key={s.id} title={s.name} className="sticky top-0 z-10 bg-canvas border-b border-r border-line px-2 font-mono font-semibold text-ink2 min-w-[52px]">{s.code}</th>)}
              <th className="sticky top-0 z-10 bg-ink text-white border-b border-line px-2 font-semibold">Média</th>
              <th className="sticky top-0 z-10 bg-canvas border-b border-line px-2 font-semibold text-ink2">Reprov.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.s.id} className="hover:bg-hover">
                <td className="border-b border-r border-line px-2 font-mono text-center">{i + 1}</td>
                <td className="border-b border-r border-line px-2 font-mono">{r.s.studentNo}</td>
                <td className="sticky left-0 bg-white border-b border-r border-line px-2 whitespace-nowrap text-sm">{r.s.name}</td>
                {r.vals.map((v, j) => <td key={j} className={cx('border-b border-r border-line px-2 font-mono text-right', v != null && !passed(v) ? 'bg-bad-bg text-bad' : '')}>{v != null ? v.toFixed(1) : '—'}</td>)}
                <td className="border-b border-r border-line px-2 font-mono text-right font-bold">{num2(r.avg)}</td>
                <td className="border-b border-line px-2 font-mono text-center">{r.failed || ''}</td>
              </tr>
            ))}
            <tr className="bg-canvas font-semibold">
              <td colSpan={3} className="sticky left-0 bg-canvas border-r border-line px-2 h-9 text-right text-sm">Média Turma</td>
              {colAvg.map((v, i) => <td key={i} className="border-r border-line px-2 font-mono text-right">{v ? v.toFixed(1) : '—'}</td>)}
              <td colSpan={2} />
            </tr>
          </tbody>
        </table>
      </div>
      <div className="flex gap-4 text-xs text-ink2 mt-2"><span className="flex items-center gap-1"><span className="w-3 h-3 bg-bad-bg border border-bad/30 rounded-sm" />0–5,00 Reprovado</span><span>di atas 5,00 Aprovado · skala 0–10</span></div>
    </>
  );
}

export default function Grades() {
  const { pathname } = useLocation();
  const nav = useNavigate();
  const { can } = useAuth();
  const db = useDB();
  const tab = pathname.endsWith('/submissions') ? 'submissions' : pathname.endsWith('/recap') ? 'recap' : 'gradebook';
  return (
    <div>
      <PageHeader title="Buku Nilai, CAU 1/2/3 & Pauta Valor" subtitle="Caderneta por Disciplina · Skala 0–10 · Reprovado 0–5,00 · Aprovado di atas 5,00" />
      <Tabs value={tab} onChange={(t) => nav(t === 'gradebook' ? '/grades' : `/grades/${t}`)} tabs={[
        { id: 'gradebook', label: 'Caderneta (Gradebook)' },
        { id: 'submissions', label: 'Tabel Pauta Guru Excel', count: db.pautaSubmissions.filter((p) => p.status === 'PENDING_DIRECTOR_REVIEW').length },
        ...(can('assessment.view') && (can('grade.review') || can('score.revise')) ? [{ id: 'recap', label: 'Rekapitulasaun Valór' }] : []),
      ]} />
      {tab === 'gradebook' && <Gradebook />}
      {tab === 'submissions' && <Submissions />}
      {tab === 'recap' && <Recap />}
    </div>
  );
}

'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCheck, Download, FileSpreadsheet, Plus, RotateCcw, Upload } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';

import { RequirePermission } from '@/components/guards';
import {
  Alert, ApiErrorAlert, Badge, Button, Card, Checkbox, EmptyState, ErrorState, Field, Input, Modal, Mono, PageHeader, ReasonDialog, Select, Skeleton,
  StatusPill, Table, Td, Th, Tr, cx,
} from '@/components/ui';
import { useToast } from '@/components/toast';
import { useSelectedYear } from '@/features/academics/api';
import { YearSelect } from '@/features/academics/year-select';
import {
  defaultTrimester, gradeKeys, isPassing, passRule, useMyAssignments, type Assessment, type Gradebook, type GradebookStudent, type ImportJob,
  type TermGrade,
} from '@/features/grades/api';
import { useI18n } from '@/i18n';
import { API_BASE, api, fieldError, fileUrl, idempotencyKey } from '@/lib/api';
import { fmtDate, schoolToday } from '@/lib/format';
import { setPreference, usePreference } from '@/lib/storage';

const CODE: Record<string, string> = { ABSENT: 'A', EXCUSED: 'E' };

/** Cell text → score item. Empty = PENDING, A = ABSENT, E = EXCUSED, number = GRADED. */
function parseCell(text: string) {
  const v = text.trim().toUpperCase();
  if (!v) return { status: 'PENDING', score: null };
  if (v === 'A') return { status: 'ABSENT', score: null };
  if (v === 'E') return { status: 'EXCUSED', score: null };
  return { status: 'GRADED', score: v.replace(',', '.') };
}
function cellText(c: { score: string | null; status: string } | null | undefined) {
  if (!c) return '';
  if (c.status === 'GRADED') return c.score ? String(Number(c.score)) : '';
  return CODE[c.status] ?? '';
}

interface Pending { a: Assessment; s: GradebookStudent; text: string }

function ScoreInput({ a, s, row, col, disabled, onCommit }: {
  a: Assessment; s: GradebookStudent; row: number; col: number; disabled: boolean; onCommit: (p: Pending) => void;
}) {
  const server = cellText(s.scores[a.id]);
  const [text, setText] = useState(server);
  const [base, setBase] = useState(server);
  if (server !== base) { setBase(server); setText(server); } // server refresh replaces local text
  const commit = () => { if (text.trim().toUpperCase() !== server.toUpperCase()) onCommit({ a, s, text }); };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = document.getElementById(`gb-${row + (e.key === 'ArrowUp' ? -1 : 1)}-${col}`) as HTMLInputElement | null;
      if (next) next.focus(); else (e.target as HTMLInputElement).blur();
    } else if (e.key === 'Escape') setText(server);
  };
  const n = Number(text.replace(',', '.'));
  const invalid = text.trim() !== '' && !/^[AaEe]$/.test(text.trim()) && (Number.isNaN(n) || n < 0 || n > Number(a.max_score));
  return (
    <input
      id={`gb-${row}-${col}`}
      aria-label={`${s.full_name} · ${a.title}`}
      value={text}
      disabled={disabled}
      inputMode="decimal"
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={onKey}
      onFocus={(e) => e.target.select()}
      className={cx(
        'w-16 h-8 rounded border text-center font-mono text-sm bg-white focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:bg-transparent disabled:border-transparent',
        invalid ? 'border-bad text-bad' : 'border-line',
        s.scores[a.id]?.status === 'ABSENT' && 'text-bad',
      )}
    />
  );
}

function AddAssessment({ gb, open, onClose }: { gb: Gradebook; open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const comps = gb.scheme?.components ?? [];
  const [form, setForm] = useState({ grading_component: comps[0]?.id ?? '', title: '', assessment_date: schoolToday(), max_score: gb.scheme ? String(Number(gb.scheme.scale_max)) : '10', is_remedial: false });
  const m = useMutation({
    mutationFn: () => api.post('/assessments/', { ...form, title: form.title || comps.find((c) => c.id === form.grading_component)?.name, teaching_assignment: gb.teaching_assignment.id, trimester: gb.trimester.id }),
    onSuccess: () => { toast(t('common.saved'), 'ok'); qc.invalidateQueries({ queryKey: ['grades'] }); onClose(); },
  });
  return (
    <Modal open={open} onClose={onClose} title={t('gb.addAssessment')}
      footer={<><Button onClick={onClose}>{t('common.cancel')}</Button><Button variant="primary" disabled={m.isPending || !form.grading_component} onClick={() => m.mutate()}>{t('common.save')}</Button></>}>
      <div className="space-y-3">
        <ApiErrorAlert error={m.error} />
        <Field label={t('gb.component')} required error={fieldError(m.error, 'grading_component')}>
          <Select value={form.grading_component} onChange={(e) => setForm({ ...form, grading_component: e.target.value })}>
            {comps.map((c) => <option key={c.id} value={c.id}>{c.name} ({Number(c.weight_percent)}%)</option>)}
          </Select>
        </Field>
        <Field label={t('common.name')} error={fieldError(m.error, 'title')}>
          <Input value={form.title} placeholder={comps.find((c) => c.id === form.grading_component)?.name} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('gb.date')} required error={fieldError(m.error, 'assessment_date')}>
            <Input type="date" value={form.assessment_date} onChange={(e) => setForm({ ...form, assessment_date: e.target.value })} />
          </Field>
          <Field label={t('gb.maxScore')} required error={fieldError(m.error, 'max_score')}>
            <Input type="number" min="1" step="0.5" value={form.max_score} onChange={(e) => setForm({ ...form, max_score: e.target.value })} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.is_remedial} onChange={(v) => setForm({ ...form, is_remedial: v })} />{t('gb.remedial')}</label>
      </div>
    </Modal>
  );
}

function ImportDialog({ gb, open, onClose }: { gb: Gradebook; open: boolean; onClose: () => void }) {
  const { t, tx } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const [job, setJob] = useState<ImportJob | null>(null);
  const upload = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('import_type', 'SCORES');
      form.append('file', file);
      form.append('params', JSON.stringify({ teaching_assignment: gb.teaching_assignment.id, trimester: gb.trimester.id }));
      return api.post<ImportJob>('/imports/', form, { idempotencyKey: idempotencyKey() });
    },
    onSuccess: setJob,
  });
  const confirm = useMutation({
    mutationFn: () => api.post<ImportJob>(`/imports/${job!.id}/confirm/`),
    onSuccess: (j) => {
      setJob(j);
      qc.invalidateQueries({ queryKey: ['grades'] });
      if (j.status === 'COMPLETED') { toast(t('gb.imported'), 'ok'); close(); }
    },
  });
  const close = () => { setJob(null); upload.reset(); confirm.reset(); onClose(); };
  const titles = Object.fromEntries(gb.assessments.map((a) => [a.id, a.title]));
  const cols = job ? [...new Set(job.preview.flatMap((r) => Object.keys(r.values)))] : [];
  return (
    <Modal open={open} onClose={close} size="lg" title={job ? t('gb.importPreview') : t('gb.import')}
      footer={<>
        <Button onClick={close}>{t('common.close')}</Button>
        {job?.status === 'READY' && <Button variant="primary" icon={CheckCheck} disabled={confirm.isPending} onClick={() => confirm.mutate()}>{t('gb.importConfirm')}</Button>}
      </>}>
      <div className="space-y-3">
        <ApiErrorAlert error={upload.error || confirm.error} />
        {!job ? (
          <>
            <Alert>{t('gb.hint')}</Alert>
            <a className="inline-flex items-center gap-1.5 text-sm text-accent underline" href={`${API_BASE}/imports/template/?import_type=SCORES&teaching_assignment=${gb.teaching_assignment.id}&trimester=${gb.trimester.id}`}>
              <Download className="w-4 h-4" aria-hidden />{t('gb.template')}
            </a>
            <Field label="File (.xlsx / .csv)">
              <Input type="file" accept=".xlsx,.csv" disabled={upload.isPending} onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate(f); }} />
            </Field>
          </>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 items-center">
              <StatusPill status={job.status} />
              <Badge>{t('gb.rows')}: {job.total_rows}</Badge>
              <Badge tone="ok">{t('gb.valid')}: {job.valid_rows}</Badge>
              <Badge tone={job.invalid_rows ? 'bad' : 'neutral'}>{t('gb.invalid')}: {job.invalid_rows}</Badge>
              <span className="text-xs text-ink2">{job.source_name}</span>
            </div>
            {job.result.same_file_as && <Alert tone="warn">File yang sama sudah pernah diimpor.</Alert>}
            {job.status === 'COMPLETED_WITH_ERRORS' && job.result_file && <Alert tone="warn" action={<a className="underline" href={fileUrl(job.result_file)}>CSV</a>}>{job.result.errors}</Alert>}
            {job.row_errors.length > 0 && (
              <Card pad={false}><Table>
                <thead><tr><Th>{t('gb.rows')}</Th><Th>Kolom</Th><Th>Error</Th><Th>Nilai</Th></tr></thead>
                <tbody>{job.row_errors.map((e, i) => <Tr key={i}><Td mono>{e.row_number}</Td><Td>{e.field_name}</Td><Td className="text-bad">{tx(`error.${e.error_code}`, e.message)} — {e.message}</Td><Td mono>{e.raw_value}</Td></Tr>)}</tbody>
              </Table></Card>
            )}
            {job.preview.length > 0 && (
              <Card pad={false} className="max-h-80 overflow-auto"><Table>
                <thead><tr><Th>{t('student.no')}</Th><Th>{t('common.name')}</Th>{cols.map((c) => <Th key={c} align="center">{titles[c] ?? c.slice(0, 8)}</Th>)}</tr></thead>
                <tbody>{job.preview.map((r) => (
                  <Tr key={r.row}><Td mono>{r.student_no}</Td><Td>{r.full_name}</Td>
                    {cols.map((c) => <Td key={c} align="center" mono>{r.values[c] ? (r.values[c].score != null ? Number(r.values[c].score) : CODE[r.values[c].status]) : ''}</Td>)}
                  </Tr>
                ))}</tbody>
              </Table></Card>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

function OverrideDialog({ tg, onClose }: { tg: TermGrade | null; onClose: () => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [score, setScore] = useState('');
  const [reason, setReason] = useState('');
  const m = useMutation({
    mutationFn: () => api.post(`/term-grades/${tg!.id}/override/`, { final_score: score, reason }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['grades'] }); onClose(); },
  });
  return (
    <Modal open={!!tg} onClose={onClose} size="sm" title={t('gb.override')}
      footer={<><Button onClick={onClose}>{t('common.cancel')}</Button><Button variant="primary" disabled={!score || !reason.trim() || m.isPending} onClick={() => m.mutate()}>{t('common.save')}</Button></>}>
      <div className="space-y-3">
        <ApiErrorAlert error={m.error} />
        {tg && <p className="text-sm text-ink2">{tg.student_name} · {t('gb.final')}: <Mono>{tg.final_score}</Mono></p>}
        <Field label={t('gb.final')} required><Input type="number" step="0.01" value={score} onChange={(e) => setScore(e.target.value)} /></Field>
        <Field label={t('common.reason')} required><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('common.reasonPlaceholder')} /></Field>
      </div>
    </Modal>
  );
}

function Grid({ gb }: { gb: Gradebook }) {
  const { t, tx, locale } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const [error, setError] = useState<unknown>(null);
  const [revision, setRevision] = useState<Pending | null>(null);
  const [reopen, setReopen] = useState<TermGrade | null>(null);
  const [override, setOverride] = useState<TermGrade | null>(null);
  const [statusFor, setStatusFor] = useState<{ a: Assessment; target: string } | null>(null);
  const key = gradeKeys.gradebook(gb.teaching_assignment.id, gb.trimester.id);

  const save = async (p: Pending, reason?: string) => {
    const cell = p.s.scores[p.a.id];
    const item = { student_id: p.s.student_id, ...parseCell(p.text), expected_version: cell?.version ?? null, ...(reason ? { reason } : {}) };
    try {
      await api.put(`/assessments/${p.a.id}/scores/`, { scores: [item] });
      setError(null);
      toast(t('gb.saved'), 'ok');
    } catch (e) {
      setError(e);
    }
    await qc.invalidateQueries({ queryKey: key });
  };
  const onCommit = (p: Pending) => {
    const cell = p.s.scores[p.a.id];
    if (p.a.status === 'CLOSED' && cell?.status === 'GRADED') setRevision(p);
    else void save(p);
  };
  const finalize = useMutation({
    mutationFn: () => api.post<{ finalized: number }>('/term-grades/finalize/', { teaching_assignment: gb.teaching_assignment.id, trimester: gb.trimester.id }),
    onSuccess: () => { toast(t('gb.finalized'), 'ok'); qc.invalidateQueries({ queryKey: ['grades'] }); },
  });

  const scheme = gb.scheme;
  const finalizedCount = gb.students.filter((s) => s.term_grade?.status === 'FINALIZED').length;
  return (
    <>
      {scheme ? (
        <Card className="mb-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <span className="font-semibold">{scheme.name}</span>
            <span className="text-ink2">{t('gb.weights')}: {scheme.components.map((c) => `${c.name} ${Number(c.weight_percent)}%`).join(' · ')}</span>
            <span className="text-ink2">{t('gb.scale')}: 0–{Number(scheme.scale_max)}</span>
            <span className="text-ink2">{t('gb.pass')}: <Mono>{passRule(scheme)}</Mono></span>
            <StatusPill status={gb.trimester.status} />
            {gb.trimester.grade_entry_end && <span className="text-xs text-ink2">{t('trimester.gradeEntryEnd')}: {fmtDate(gb.trimester.grade_entry_end, locale)}</span>}
          </div>
        </Card>
      ) : <div className="mb-4"><Alert tone="warn">{t('gb.noScheme')}</Alert></div>}
      {error != null && <div className="mb-3"><ApiErrorAlert error={error} /></div>}
      {(finalize.error) && <div className="mb-3"><ApiErrorAlert error={finalize.error} /></div>}
      <p className="text-xs text-ink2 mb-2">{t('gb.hint')}</p>
      <Card pad={false} className="overflow-x-auto">
        <Table className="min-w-max">
          <thead>
            <tr>
              <Th className="sticky left-0 bg-white z-10">{t('common.name')}</Th>
              {gb.assessments.map((a) => (
                <Th key={a.id} align="center" className="min-w-28">
                  <div className="flex flex-col items-center gap-1 normal-case">
                    <span className="font-semibold text-ink">{a.title}{a.is_remedial && ' ↺'}</span>
                    <span className="text-[11px] text-ink2 font-normal">{a.component_name} · /{Number(a.max_score)} · {fmtDate(a.assessment_date, locale)}</span>
                    {gb.can_edit ? (
                      <Select aria-label={`${t('gb.statusMenu')} ${a.title}`} className="h-7 w-auto text-xs py-0" value={a.status}
                        onChange={(e) => setStatusFor({ a, target: e.target.value })}>
                        <option value={a.status}>{tx(`status.${a.status}`, a.status)}</option>
                        {['OPEN', 'CLOSED', 'LOCKED'].filter((s) => s !== a.status).map((s) => <option key={s} value={s}>{t(`gb.to${s}` as 'gb.toOPEN')}</option>)}
                      </Select>
                    ) : <StatusPill status={a.status} />}
                  </div>
                </Th>
              ))}
              <Th align="center">{t('gb.final')}</Th>
              <Th>{t('common.status')}</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {gb.students.map((s, row) => {
              const tg = s.term_grade;
              const locked = tg?.status === 'FINALIZED';
              const final = tg?.status === 'FINALIZED' ? tg.final_score : s.preview?.final;
              const pass = locked || s.preview?.complete ? isPassing(final, scheme) : null;
              return (
                <Tr key={s.student_id}>
                  <Td className="sticky left-0 bg-white z-10"><div className="font-medium">{s.full_name}</div><Mono className="text-xs text-ink2">{s.student_no}</Mono></Td>
                  {gb.assessments.map((a, col) => (
                    <Td key={a.id} align="center">
                      <ScoreInput a={a} s={s} row={row} col={col} onCommit={onCommit}
                        disabled={!gb.can_edit || locked || a.status === 'LOCKED' || a.status === 'DRAFT'} />
                    </Td>
                  ))}
                  <Td align="center">
                    <div className={cx('font-mono font-semibold', pass === false && 'text-bad', pass && 'text-ok')}>{final != null ? Number(final).toFixed(scheme?.precision ?? 2) : '—'}</div>
                    {!locked && s.preview && !s.preview.complete && <div className="text-[11px] text-warn" title={s.preview.missing.join(', ')}>{t('gb.incomplete')}</div>}
                  </Td>
                  <Td><StatusPill status={tg?.status ?? 'DRAFT'} />{tg?.grade_label && <span className="ml-1 text-xs text-ink2">{tg.grade_label}</span>}</Td>
                  <Td>
                    {locked && gb.can_reopen && (
                      <div className="flex gap-1">
                        <Button size="sm" icon={RotateCcw} onClick={() => setReopen(tg)}>{t('gb.reopen')}</Button>
                        <Button size="sm" onClick={() => setOverride(tg)}>{t('gb.override')}</Button>
                      </div>
                    )}
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
        {!gb.students.length && <EmptyState />}
      </Card>
      <div className="flex items-center justify-between mt-4">
        <span className="text-sm text-ink2">{t('comp.finalized')}: {finalizedCount}/{gb.students.length}</span>
        {gb.can_finalize && scheme && (
          <Button variant="primary" icon={CheckCheck} disabled={finalize.isPending || finalizedCount === gb.students.length} onClick={() => finalize.mutate()}>{t('gb.finalize')}</Button>
        )}
      </div>
      <ReasonDialog open={!!revision} onClose={() => { setRevision(null); void qc.invalidateQueries({ queryKey: key }); }} title={t('gb.revisionReason')}
        confirmLabel={t('common.save')} onConfirm={async (r) => { await save(revision!, r); setRevision(null); }} />
      <ReasonDialog open={!!reopen} onClose={() => setReopen(null)} title={t('gb.reopen')} confirmLabel={t('gb.reopen')} danger
        onConfirm={async (r) => { await api.post(`/term-grades/${reopen!.id}/reopen/`, { reason: r }); await qc.invalidateQueries({ queryKey: ['grades'] }); }} />
      <ReasonDialog open={!!statusFor} onClose={() => setStatusFor(null)} title={`${t('gb.statusMenu')}: ${statusFor?.a.title ?? ''} → ${statusFor?.target ?? ''}`}
        confirmLabel={t('common.confirm')} optional={statusFor?.target !== 'OPEN' || statusFor?.a.status !== 'LOCKED'}
        onConfirm={async (r) => { await api.post(`/assessments/${statusFor!.a.id}/status/`, { status: statusFor!.target, reason: r }); await qc.invalidateQueries({ queryKey: key }); }} />
      <OverrideDialog key={override?.id ?? 'none'} tg={override} onClose={() => setOverride(null)} />
    </>
  );
}

function GradebookScreen() {
  const { t } = useI18n();
  const { year } = useSelectedYear();
  const assignments = useMyAssignments(year?.id);
  const savedTa = usePreference('nossef.gb.ta', '');
  const [trimId, setTrimId] = useState('');
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const list = assignments.data ?? [];
  const ta = list.find((a) => a.id === savedTa) ?? list[0];
  const trimesters = year?.trimesters ?? [];
  const tr = trimesters.find((x) => x.id === trimId) ?? defaultTrimester(trimesters);
  const gb = useQuery({
    queryKey: gradeKeys.gradebook(ta?.id, tr?.id),
    queryFn: () => api.get<Gradebook>('/gradebook/', { teaching_assignment_id: ta!.id, trimester_id: tr!.id }),
    enabled: !!ta && !!tr,
    placeholderData: keepPreviousData,
  });
  const data = gb.data;
  return (
    <>
      <PageHeader title={t('gb.title')} subtitle={data ? `${data.teaching_assignment.classroom} · ${data.teaching_assignment.subject_name} · ${data.teaching_assignment.teacher}` : undefined}
        actions={<>
          <YearSelect />
          <Select aria-label={t('gb.assignment')} className="h-9 w-auto max-w-64" value={ta?.id ?? ''} onChange={(e) => setPreference('nossef.gb.ta', e.target.value)}>
            {list.map((a) => <option key={a.id} value={a.id}>{a.classroom} · {a.subject_code}</option>)}
          </Select>
          <Select aria-label={t('common.trimester')} className="h-9 w-auto" value={tr?.id ?? ''} onChange={(e) => setTrimId(e.target.value)}>
            {trimesters.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </Select>
          {data?.can_edit && data.scheme && <>
            <Button icon={FileSpreadsheet} onClick={() => setImporting(true)}>{t('gb.import')}</Button>
            <Button variant="primary" icon={Plus} onClick={() => setAdding(true)}>{t('gb.addAssessment')}</Button>
          </>}
        </>} />
      {assignments.isPending ? <Card pad={false}><Skeleton /></Card>
        : !list.length ? <EmptyState title={t('gb.selectAssignment')} icon={Upload} />
        : gb.isPending ? <Card pad={false}><Skeleton /></Card>
        : gb.error ? <ErrorState error={gb.error} onRetry={() => gb.refetch()} />
        : data && <Grid key={`${data.teaching_assignment.id}-${data.trimester.id}`} gb={data} />}
      {data && adding && <AddAssessment gb={data} open onClose={() => setAdding(false)} />}
      {data && <ImportDialog gb={data} open={importing} onClose={() => setImporting(false)} />}
    </>
  );
}

export default function GradebookPage() {
  return (
    <RequirePermission any={['assessment.view']}>
      <GradebookScreen />
    </RequirePermission>
  );
}


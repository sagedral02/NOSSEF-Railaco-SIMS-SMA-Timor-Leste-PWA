'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, RotateCcw, ScanLine } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import { RequirePermission } from '@/components/guards';
import { ResourcePage, type Row } from '@/components/resource';
import {
  ApiErrorAlert, Badge, Button, Card, Drawer, EmptyState, ErrorState, Field, FilterPills, Input, Mono, PageHeader, Pager, ReasonDialog, SearchInput,
  Select, Skeleton, StatusPill, Table, Tabs, Td, Th, Tr, cx,
} from '@/components/ui';
import { useToast } from '@/components/toast';
import { teacherOptions } from '@/features/academics/options';
import { useAuth } from '@/features/auth/auth';
import { StudentSearchField } from '@/features/students/student-field';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { fmtDate, fmtDateTime, usd } from '@/lib/format';
import { useQueryParam } from '@/lib/url';

interface Loan {
  id: string; copy: string; barcode: string; book_title: string; student: string | null; teacher: string | null; borrower_name: string; borrower_type: string;
  borrowed_at: string; due_at: string; returned_at: string | null; status: string; fine_amount: string; renew_count: number; overdue: boolean;
}
interface Copy { id: string; book: string; book_title: string; barcode: string; condition: string; status: string; shelf: string }

function Desk() {
  const { t, locale } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const [barcode, setBarcode] = useState('');
  const [type, setType] = useState<'STUDENT' | 'TEACHER'>('STUDENT');
  const [student, setStudent] = useState<string | null>(null);
  const [teacher, setTeacher] = useState('');
  const [retCode, setRetCode] = useState('');
  const teachers = useQuery({ queryKey: ['options', 'teachers-lib'], queryFn: () => api.get<Row[]>(teacherOptions!.path, { ...teacherOptions!.query, page_size: 100 }) });
  const checkout = useMutation({
    mutationFn: () => api.post<Loan>('/library/loans/', { barcode: barcode.trim(), student: type === 'STUDENT' ? student : null, teacher: type === 'TEACHER' ? teacher : null }),
    onSuccess: (l) => { toast(t('lib.checkedOut', { due: fmtDate(l.due_at, locale) }), 'ok'); setBarcode(''); qc.invalidateQueries({ queryKey: ['library'] }); },
  });
  const ret = useMutation({
    mutationFn: async () => {
      const open = await api.page<Loan>('/library/loans/', { q: retCode.trim(), status: 'OPEN,OVERDUE' });
      const loan = open.data.find((l) => l.barcode.toLowerCase() === retCode.trim().toLowerCase());
      if (!loan) throw new Error(t('error.RESOURCE_NOT_FOUND'));
      return api.post<Loan>(`/library/loans/${loan.id}/return/`, { condition: 'GOOD' });
    },
    onSuccess: (l) => { toast(`${t('lib.returned')} ${Number(l.fine_amount) ? `${t('lib.fine')}: ${usd(l.fine_amount)}` : ''}`, 'ok'); setRetCode(''); qc.invalidateQueries({ queryKey: ['library'] }); },
  });
  const submit = (e: FormEvent) => { e.preventDefault(); checkout.mutate(); };
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title={t('lib.checkout')}>
        <form className="space-y-3" onSubmit={submit}>
          <ApiErrorAlert error={checkout.error} />
          <Field label={t('lib.barcode')} required><Input mono autoFocus placeholder={t('lib.scan')} value={barcode} onChange={(e) => setBarcode(e.target.value)} /></Field>
          <FilterPills value={type} onChange={setType} options={[{ id: 'STUDENT', label: t('lib.student') }, { id: 'TEACHER', label: t('lib.teacher') }]} />
          {type === 'STUDENT' ? <Field label={t('lib.borrower')} required><StudentSearchField value={student} onChange={setStudent} /></Field> : (
            <Field label={t('lib.borrower')} required>
              <Select value={teacher} onChange={(e) => setTeacher(e.target.value)}><option value="">—</option>{(teachers.data ?? []).map((x) => <option key={x.id} value={x.id}>{String(x.full_name)}</option>)}</Select>
            </Field>
          )}
          <div className="flex justify-end"><Button type="submit" variant="primary" icon={BookOpen} disabled={!barcode.trim() || (type === 'STUDENT' ? !student : !teacher) || checkout.isPending}>{t('lib.checkout')}</Button></div>
        </form>
      </Card>
      <Card title={t('lib.return')}>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); ret.mutate(); }}>
          <ApiErrorAlert error={ret.error} />
          <Field label={t('lib.barcode')} required><Input mono placeholder={t('lib.scan')} value={retCode} onChange={(e) => setRetCode(e.target.value)} /></Field>
          <div className="flex justify-end"><Button type="submit" icon={RotateCcw} disabled={!retCode.trim() || ret.isPending}>{t('lib.return')}</Button></div>
        </form>
      </Card>
    </div>
  );
}

function Loans() {
  const { t, tx, locale } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useAuth();
  const [status, setStatus] = useState('OPEN,OVERDUE');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [lost, setLost] = useState<Loan | null>(null);
  const params = { status, q, page };
  const list = useQuery({ queryKey: ['library', 'loans', params], queryFn: ({ signal }) => api.page<Loan>('/library/loans/', params, signal), placeholderData: keepPreviousData });
  const act = useMutation({
    mutationFn: ({ id, op }: { id: string; op: 'return' | 'renew' }) => api.post<Loan>(`/library/loans/${id}/${op}/`, op === 'return' ? { condition: 'GOOD' } : undefined),
    onSuccess: (_, v) => { toast(v.op === 'return' ? t('lib.returned') : t('common.saved'), 'ok'); qc.invalidateQueries({ queryKey: ['library'] }); },
  });
  return (
    <>
      <div className="flex flex-wrap gap-3 items-center mb-3">
        <FilterPills value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[
          { id: 'OPEN,OVERDUE', label: t('lib.borrowed') }, { id: 'OVERDUE', label: t('lib.overdue') }, { id: 'RETURNED', label: tx('status.RETURNED', 'RETURNED') }, { id: 'LOST', label: tx('status.LOST', 'LOST') }, { id: '', label: t('common.all') },
        ]} />
        <SearchInput className="md:ml-auto md:w-72" value={q} onChange={(v) => { setQ(v); setPage(1); }} />
      </div>
      <ApiErrorAlert error={act.error} />
      {list.isPending ? <Card pad={false}><Skeleton /></Card> : list.error ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : (
        <Card pad={false}>
          <Table>
            <thead><tr><Th>{t('lib.barcode')}</Th><Th>{t('lib.title')}</Th><Th>{t('lib.borrower')}</Th><Th>{t('lib.borrowed')}</Th><Th>{t('lib.due')}</Th><Th>{t('common.status')}</Th><Th /></tr></thead>
            <tbody>{list.data.data.map((l) => (
              <Tr key={l.id}>
                <Td mono>{l.barcode}</Td><Td>{l.book_title}</Td>
                <Td>{l.borrower_name} <Badge>{tx(`lib.${l.borrower_type.toLowerCase()}`, l.borrower_type)}</Badge></Td>
                <Td>{fmtDate(l.borrowed_at, locale)}</Td>
                <Td className={cx(l.overdue && 'text-bad font-semibold')}>{fmtDate(l.due_at, locale)}{l.renew_count > 0 && <span className="text-xs text-ink2"> ↻{l.renew_count}</span>}</Td>
                <Td><StatusPill status={l.status} />{Number(l.fine_amount) > 0 && <div className="text-xs text-bad">{usd(l.fine_amount)}</div>}</Td>
                <Td>{(l.status === 'OPEN' || l.status === 'OVERDUE') && (
                  <div className="flex gap-1 justify-end">
                    {can('library.return') && <Button size="sm" onClick={() => act.mutate({ id: l.id, op: 'return' })}>{t('lib.return')}</Button>}
                    <Button size="sm" variant="ghost" onClick={() => act.mutate({ id: l.id, op: 'renew' })}>{t('lib.renew')}</Button>
                    {can('library.return') && <Button size="sm" variant="ghost" onClick={() => setLost(l)}>{t('lib.lost')}</Button>}
                  </div>
                )}{l.returned_at && <span className="text-xs text-ink2">{fmtDateTime(l.returned_at, locale)}</span>}</Td>
              </Tr>
            ))}</tbody>
          </Table>
          {!list.data.data.length && <EmptyState />}
          <Pager page={list.data.meta.page} totalPages={list.data.meta.total_pages} count={list.data.meta.count} pageSize={list.data.meta.page_size} onPage={setPage} />
        </Card>
      )}
      <ReasonDialog open={!!lost} onClose={() => setLost(null)} title={t('lib.lost')} confirmLabel={t('lib.lost')} danger
        onConfirm={async (note) => { await api.post(`/library/loans/${lost!.id}/lost/`, { note }); await qc.invalidateQueries({ queryKey: ['library'] }); }} />
    </>
  );
}

function CopiesDrawer({ book, onClose }: { book: Row; onClose: () => void }) {
  const { t, tx } = useI18n();
  const qc = useQueryClient();
  const { can } = useAuth();
  const [barcode, setBarcode] = useState('');
  const [shelf, setShelf] = useState('');
  const copies = useQuery({ queryKey: ['library', 'copies', book.id], queryFn: () => api.get<Copy[]>('/library/copies/', { book_id: book.id }) });
  const add = useMutation({ mutationFn: () => api.post('/library/copies/', { book: book.id, barcode, shelf }), onSuccess: () => { setBarcode(''); qc.invalidateQueries({ queryKey: ['library'] }); qc.invalidateQueries({ queryKey: ['resource'] }); } });
  const setStatus = useMutation({ mutationFn: ({ id, status }: { id: string; status: string }) => api.post(`/library/copies/${id}/status/`, { status }), onSuccess: () => qc.invalidateQueries({ queryKey: ['library'] }) });
  return (
    <Drawer open onClose={onClose} width={520} title={String(book.title)} subtitle={String(book.author || '')}>
      <ApiErrorAlert error={add.error || setStatus.error} />
      {copies.isPending ? <Skeleton rows={3} /> : (
        <Card pad={false} className="mb-4">
          <Table><tbody>{(copies.data ?? []).map((c) => (
            <Tr key={c.id}>
              <Td mono>{c.barcode}</Td><Td className="text-xs text-ink2">{c.shelf}</Td><Td><StatusPill status={c.status} /></Td>
              <Td>{can('library.manage_catalog') && c.status !== 'ON_LOAN' && (
                <Select aria-label={t('common.status')} className="h-8 w-auto text-xs" value={c.status} onChange={(e) => setStatus.mutate({ id: c.id, status: e.target.value })}>
                  {['AVAILABLE', 'DAMAGED', 'REPAIR', 'LOST', 'WITHDRAWN'].map((s) => <option key={s} value={s}>{tx(`status.${s}`, s)}</option>)}
                </Select>
              )}</Td>
            </Tr>
          ))}</tbody></Table>
          {!copies.data?.length && <EmptyState />}
        </Card>
      )}
      {can('library.manage_catalog') && (
        <div className="flex gap-2 items-end">
          <Field label={t('lib.barcode')} className="flex-1"><Input mono value={barcode} onChange={(e) => setBarcode(e.target.value)} /></Field>
          <Field label={t('lib.shelf')} className="w-28"><Input value={shelf} onChange={(e) => setShelf(e.target.value)} /></Field>
          <Button variant="primary" disabled={!barcode.trim() || add.isPending} onClick={() => add.mutate()}>{t('lib.addCopy')}</Button>
        </div>
      )}
    </Drawer>
  );
}

function LibraryScreen() {
  const { t } = useI18n();
  const { can } = useAuth();
  const [tab, setTab] = useState<'desk' | 'loans' | 'catalog'>(can('library.issue') ? 'desk' : 'catalog');
  useQueryParam('tab', (v) => setTab(v as 'desk' | 'loans' | 'catalog'), ['desk', 'loans', 'catalog']);
  const [book, setBook] = useState<Row | null>(null);
  return (
    <>
      {tab !== 'catalog' && <PageHeader title={t('nav.library')} />}
      <Tabs value={tab} onChange={setTab} tabs={[
        ...(can('library.issue') ? [{ id: 'desk' as const, label: t('lib.desk'), icon: ScanLine }] : []),
        { id: 'loans', label: t('lib.loans') }, { id: 'catalog', label: t('lib.catalog') },
      ]} />
      {tab === 'desk' && <Desk />}
      {tab === 'loans' && <Loans />}
      {tab === 'catalog' && (
        <ResourcePage title="lib.catalog" path="/library/books/" paginated searchable managePermission="library.manage_catalog" rowTitle={(r) => String(r.title)}
          toPayload={(v) => ({ ...v, publication_year: v.publication_year || null })}
          rowActions={(r) => <Button size="sm" onClick={() => setBook(r)}>{t('lib.copies')}</Button>}
          columns={[
            { header: 'lib.title', cell: (r) => <><div className="font-medium">{String(r.title)}</div><div className="text-xs text-ink2">{String(r.author || '')}</div></> },
            { header: 'lib.category', cell: (r) => String(r.category || '—') },
            { header: 'lib.year', cell: (r) => String(r.publication_year ?? '—'), mono: true },
            { header: 'lib.available', cell: (r) => <Mono>{String(r.copies_available)}/{String(r.copies_total)}</Mono>, align: 'right' },
          ]}
          fields={[
            { name: 'title', label: 'lib.title', required: true, span: 2 },
            { name: 'author', label: 'lib.author' },
            { name: 'publisher', label: 'lib.publisher' },
            { name: 'isbn', label: 'lib.barcode', mono: true },
            { name: 'publication_year', label: 'lib.year', type: 'number' },
            { name: 'category', label: 'lib.category' },
            { name: 'active', label: 'common.status', type: 'checkbox', default: true },
          ]}
        />
      )}
      {book && <CopiesDrawer key={String(book.id)} book={book} onClose={() => setBook(null)} />}
    </>
  );
}

export default function LibraryPage() {
  return (
    <RequirePermission any={['library.view', 'library.issue']}>
      <LibraryScreen />
    </RequirePermission>
  );
}

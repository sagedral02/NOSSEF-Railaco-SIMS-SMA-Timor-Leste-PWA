'use client';

// Config-driven list + create/edit drawer for master-data resources (PRD §35.3 page states, §35.4 tables).
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState, type FormEvent, type ReactNode } from 'react';

import { useToast } from '@/components/toast';
import {
  ApiErrorAlert, Button, Card, Checkbox, Drawer, EmptyState, ErrorState, Field, Input, Modal, Pager, PageHeader, SearchInput, Select,
  Skeleton, Table, Td, Textarea, Th, Tr,
} from '@/components/ui';
import { useAuth } from '@/features/auth/auth';
import { StudentSearchField } from '@/features/students/student-field';
import { useI18n, type MessageKey } from '@/i18n';
import { api, ApiError, fieldError } from '@/lib/api';

export type Row = Record<string, unknown> & { id: string };
export interface Option { value: string; label: string }

export interface FieldDef {
  name: string;
  label: MessageKey;
  type?: 'text' | 'number' | 'date' | 'time' | 'datetime' | 'select' | 'checkbox' | 'textarea' | 'email' | 'student';
  required?: boolean;
  mono?: boolean;
  options?: Option[];
  /** Load select options from an API list endpoint. */
  optionsFrom?: { path: string; query?: Record<string, string | undefined>; label: (r: Row) => string; value?: (r: Row) => string };
  allowEmpty?: boolean;
  default?: unknown;
  /** Field shown only when creating. */
  createOnly?: boolean;
  hint?: MessageKey;
  span?: 2;
}

export interface ColumnDef {
  header: MessageKey;
  cell: (r: Row) => ReactNode;
  align?: 'right' | 'center';
  mono?: boolean;
}

export interface FilterDef {
  name: string;
  label: MessageKey;
  options: Option[];
}

interface ResourceProps {
  title: MessageKey;
  subtitle?: MessageKey;
  path: string;
  query?: Record<string, string | undefined>;
  columns: ColumnDef[];
  fields: FieldDef[];
  managePermission: string | string[];
  paginated?: boolean;
  searchable?: boolean;
  filters?: FilterDef[];
  rowTitle?: (r: Row) => string;
  rowActions?: (r: Row) => ReactNode;
  headerActions?: ReactNode;
  toPayload?: (form: Record<string, unknown>) => Record<string, unknown>;
  /** Map a row into form values when editing (e.g. ISO datetimes → local inputs). */
  initialFromRow?: (r: Row) => Record<string, unknown>;
  canDelete?: boolean;
  enabled?: boolean;
  children?: ReactNode;
}

function useOptions(field: FieldDef) {
  const q = useQuery({
    queryKey: ['options', field.optionsFrom?.path, field.optionsFrom?.query],
    queryFn: async () => {
      const out = await api.get<Row[] | Row[]>(field.optionsFrom!.path, { page_size: 100, ...field.optionsFrom!.query });
      return out;
    },
    enabled: !!field.optionsFrom,
    staleTime: 60_000,
  });
  if (field.options) return field.options;
  const rows = (q.data as Row[] | undefined) ?? [];
  return rows.map((r) => ({ value: (field.optionsFrom!.value ?? ((x: Row) => String(x.id)))(r), label: field.optionsFrom!.label(r) }));
}

function FieldInput({ field, value, onChange, error }: { field: FieldDef; value: unknown; onChange: (v: unknown) => void; error?: string }) {
  const { t } = useI18n();
  const options = useOptions(field);
  const label = t(field.label);
  const common = { 'aria-invalid': error ? true : undefined } as const;
  let control: ReactNode;
  switch (field.type) {
    case 'checkbox':
      return (
        <label className="flex items-center gap-2 text-sm h-10">
          <Checkbox checked={!!value} onChange={onChange} label={label} />
          {label}
        </label>
      );
    case 'select':
      control = (
        <Select {...common} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value || null)}>
          {(field.allowEmpty || !field.required) && <option value="">—</option>}
          {field.required && !field.allowEmpty && !value && <option value="">—</option>}
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      );
      break;
    case 'student':
      control = <StudentSearchField value={(value as string) ?? null} onChange={onChange} query={field.optionsFrom?.query} />;
      break;
    case 'textarea':
      control = <Textarea {...common} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} />;
      break;
    default:
      control = (
        <Input
          {...common}
          mono={field.mono}
          type={field.type === 'datetime' ? 'datetime-local' : field.type || 'text'}
          value={value == null ? '' : String(field.type === 'datetime' ? String(value).slice(0, 16) : value)}
          onChange={(e) => onChange(field.type === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value)}
        />
      );
  }
  return (
    <Field label={label} required={field.required} error={error} hint={field.hint ? t(field.hint) : undefined} className={field.span === 2 ? 'md:col-span-2' : undefined}>
      {control}
    </Field>
  );
}

export function ResourceForm({ fields, initial, editing, error, onSubmit, formId }: {
  fields: FieldDef[]; initial: Record<string, unknown>; editing: boolean; error: unknown; onSubmit: (v: Record<string, unknown>) => void; formId: string;
}) {
  const [form, setForm] = useState<Record<string, unknown>>(initial);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };
  const known = new Set(fields.map((f) => f.name));
  const unmapped = error instanceof ApiError && Object.keys(error.fields).some((k) => !known.has(k));
  return (
    <form id={formId} onSubmit={submit} className="grid gap-4 md:grid-cols-2">
      {fields.filter((f) => !(editing && f.createOnly)).map((f) => (
        <div key={f.name} className={f.span === 2 || f.type === 'textarea' ? 'md:col-span-2' : undefined}>
          <FieldInput field={f} value={form[f.name]} onChange={(v) => setForm({ ...form, [f.name]: v })} error={fieldError(error, f.name)} />
        </div>
      ))}
      {error != null && (!(error instanceof ApiError) || error.code !== 'VALIDATION_ERROR' || unmapped) && (
        <div className="md:col-span-2"><ApiErrorAlert error={error} /></div>
      )}
    </form>
  );
}

function defaults(fields: FieldDef[], row?: Row | null) {
  const out: Record<string, unknown> = {};
  for (const f of fields) out[f.name] = row ? (row[f.name] ?? (f.type === 'checkbox' ? false : null)) : (f.default ?? (f.type === 'checkbox' ? false : null));
  return out;
}

export function ResourcePage(props: ResourceProps) {
  const { title, subtitle, path, query, columns, fields, managePermission, paginated, searchable, filters = [], rowTitle, rowActions,
    headerActions, toPayload, initialFromRow, canDelete = true, enabled = true, children } = props;
  const { t } = useI18n();
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const manage = can(...(Array.isArray(managePermission) ? managePermission : [managePermission]));
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Row | null | 'new'>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const params = useMemo(() => ({ ...query, ...filterValues, ...(q ? { q } : {}), ...(paginated ? { page } : {}) }), [query, filterValues, q, page, paginated]);
  const key = ['resource', path, params];
  const list = useQuery({
    queryKey: key,
    enabled,
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) => {
      if (paginated) return api.page<Row>(path, params, signal);
      return { data: await api.get<Row[]>(path, params, signal), meta: null };
    },
  });
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['resource', path] });
    qc.invalidateQueries({ queryKey: ['options', path] });
  };
  const save = useMutation({
    mutationFn: (form: Record<string, unknown>) => {
      const body = toPayload ? toPayload(form) : form;
      return editing && editing !== 'new' ? api.patch<Row>(`${path}${editing.id}/`, body) : api.post<Row>(path, body);
    },
    onSuccess: () => {
      invalidate();
      toast(t('common.saved'));
      setEditing(null);
    },
  });
  const remove = useMutation({
    mutationFn: (row: Row) => api.delete(`${path}${row.id}/`),
    onSuccess: () => {
      invalidate();
      setDeleting(null);
      toast(t('common.deleted'));
    },
  });
  const rows = list.data?.data ?? [];
  const meta = list.data?.meta as { page: number; total_pages: number; count: number; page_size: number } | null | undefined;

  return (
    <>
      <PageHeader
        title={t(title)}
        subtitle={subtitle ? t(subtitle) : undefined}
        actions={<>{headerActions}{manage && <Button variant="primary" icon={Plus} onClick={() => { save.reset(); setEditing('new'); }}>{t('common.add')}</Button>}</>}
      />
      {children}
      <Card pad={false}>
        {(searchable || filters.length > 0) && (
          <div className="flex flex-col md:flex-row gap-2 p-3 border-b border-line">
            {searchable && (
              <form className="flex-1" onSubmit={(e) => { e.preventDefault(); setQ(search); setPage(1); }}>
                <SearchInput value={search} onChange={setSearch} />
              </form>
            )}
            {filters.map((f) => (
              <Select key={f.name} aria-label={t(f.label)} className="h-9 md:w-56" value={filterValues[f.name] ?? ''} onChange={(e) => { setFilterValues({ ...filterValues, [f.name]: e.target.value }); setPage(1); }}>
                <option value="">{t(f.label)}: {t('common.all')}</option>
                {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            ))}
          </div>
        )}
        {!enabled ? (
          <EmptyState />
        ) : list.isPending ? (
          <Skeleton />
        ) : list.error ? (
          <div className="p-4"><ErrorState error={list.error} onRetry={() => list.refetch()} /></div>
        ) : rows.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  {columns.map((c) => <Th key={c.header} align={c.align}>{t(c.header)}</Th>)}
                  {(manage || rowActions) && <Th align="right">{t('common.actions')}</Th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <Tr key={r.id}>
                    {columns.map((c) => <Td key={c.header} align={c.align} mono={c.mono}>{c.cell(r)}</Td>)}
                    {(manage || rowActions) && (
                      <Td align="right">
                        <span className="inline-flex gap-1">
                          {rowActions?.(r)}
                          {manage && <Button size="sm" variant="ghost" icon={Pencil} aria-label={t('common.edit')} onClick={() => { save.reset(); setEditing(r); }} />}
                          {manage && canDelete && <Button size="sm" variant="ghost" icon={Trash2} aria-label={t('common.remove')} onClick={() => { remove.reset(); setDeleting(r); }} />}
                        </span>
                      </Td>
                    )}
                  </Tr>
                ))}
              </tbody>
            </Table>
            {meta && <Pager page={meta.page} totalPages={meta.total_pages} count={meta.count} pageSize={meta.page_size} onPage={setPage} />}
          </>
        )}
      </Card>
      <Drawer
        open={editing !== null}
        onClose={() => setEditing(null)}
        width={520}
        title={editing === 'new' ? `${t('common.add')} — ${t(title)}` : `${t('common.edit')} — ${editing && rowTitle ? rowTitle(editing) : ''}`}
        footer={
          <>
            <Button onClick={() => setEditing(null)}>{t('common.cancel')}</Button>
            <Button variant="primary" type="submit" form="resource-form" disabled={save.isPending}>{save.isPending ? t('common.processing') : t('common.save')}</Button>
          </>
        }
      >
        {editing !== null && (
          <ResourceForm
            key={editing === 'new' ? 'new' : editing.id}
            formId="resource-form"
            fields={fields}
            editing={editing !== 'new'}
            initial={defaults(fields, editing === 'new' ? null : (initialFromRow ? ({ ...editing, ...initialFromRow(editing) } as Row) : editing))}
            error={save.error}
            onSubmit={(v) => save.mutate(v)}
          />
        )}
      </Drawer>
      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={t('common.confirmDelete')}
        size="sm"
        footer={
          <>
            <Button onClick={() => setDeleting(null)}>{t('common.cancel')}</Button>
            <Button variant="danger" disabled={remove.isPending} onClick={() => deleting && remove.mutate(deleting)}>{t('common.remove')}</Button>
          </>
        }
      >
        <p className="text-sm text-ink2">{deleting && rowTitle ? rowTitle(deleting) : ''}</p>
        {remove.error && <div className="mt-3"><ApiErrorAlert error={remove.error} /></div>}
      </Modal>
    </>
  );
}

export function yesNo(v: unknown, t: (k: MessageKey) => string) {
  return v ? t('common.yes') : t('common.no');
}

'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Plus, ShieldOff, UserCheck, UserX, X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState, type FormEvent } from 'react';

import { RequirePermission } from '@/components/guards';
import { useToast } from '@/components/toast';
import {
  Alert, ApiErrorAlert, Avatar, Badge, Button, Card, Drawer, EmptyState, ErrorState, Field, Input, KV, MobileRow, Mono,
  Pager, PageHeader, ReasonDialog, SearchInput, Select, Skeleton, StatusPill, Table, Td, Th, Tr,
} from '@/components/ui';
import { ACCOUNT_STATUSES, adminKeys, PRIVILEGED_ROLES, ROLE_CODES, type User } from '@/features/admin/api';
import { useAuth } from '@/features/auth/auth';
import { useI18n } from '@/i18n';
import { api, fieldError } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';

function useUrlState() {
  const params = useSearchParams();
  const router = useRouter();
  const get = (k: string) => params.get(k) || '';
  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) if (v) next.set(k, v); else next.delete(k);
    if (!('page' in patch)) next.delete('page');
    router.replace(`?${next.toString()}`, { scroll: false });
  };
  return { get, set };
}

function CreateUserDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, tx } = useI18n();
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState({ username: '', full_name: '', email: '', password: '', role: '' });
  const create = useMutation({
    mutationFn: () =>
      api.post<User>('/users/', {
        username: form.username, full_name: form.full_name, email: form.email || null, password: form.password || undefined,
        roles: form.role ? [form.role] : [],
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
      toast(t('users.created'));
      setForm({ username: '', full_name: '', email: '', password: '', role: '' });
      onClose();
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };
  const assignable = ROLE_CODES.filter((r) => !PRIVILEGED_ROLES.has(r) || can('role.manage'));
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={t('users.new')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" type="submit" form="create-user" disabled={create.isPending || !form.username}>
            {create.isPending ? t('common.processing') : t('common.create')}
          </Button>
        </>
      }
    >
      <form id="create-user" onSubmit={submit} className="space-y-4">
        <Field label={t('users.username')} required error={fieldError(create.error, 'username')}>
          <Input mono value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} autoComplete="off" />
        </Field>
        <Field label={t('users.fullName')} error={fieldError(create.error, 'full_name')}>
          <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
        </Field>
        <Field label={t('common.email')} error={fieldError(create.error, 'email')}>
          <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label={t('users.initialPassword')} hint={t('users.initialPasswordHint')} error={fieldError(create.error, 'password')}>
          <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" />
        </Field>
        <Field label={t('users.roles')} error={fieldError(create.error, 'role')}>
          <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="">—</option>
            {assignable.map((r) => <option key={r} value={r}>{tx(`role.${r}`, r)}</option>)}
          </Select>
        </Field>
        {create.error && !Object.keys((create.error as { fields?: object }).fields ?? {}).length && <ApiErrorAlert error={create.error} />}
      </form>
    </Drawer>
  );
}

function UserDrawer({ userId, onClose }: { userId: string | null; onClose: () => void }) {
  const { t, tx, locale } = useI18n();
  const { can, user: me } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [dialog, setDialog] = useState<null | 'suspend' | 'disable' | 'activate'>(null);
  const [newRole, setNewRole] = useState('');
  const [password, setPassword] = useState('');
  const detail = useQuery({ queryKey: adminKeys.user(userId || ''), queryFn: () => api.get<User>(`/users/${userId}/`), enabled: !!userId });
  const refresh = (u: User) => {
    qc.setQueryData(adminKeys.user(u.id), u);
    qc.invalidateQueries({ queryKey: ['admin', 'users'] });
  };
  const addRole = useMutation({
    mutationFn: () => api.post<User>(`/users/${userId}/roles/`, { role: newRole }),
    onSuccess: (u) => { refresh(u); setNewRole(''); toast(t('users.roleAdded')); },
  });
  const removeRole = useMutation({
    mutationFn: (code: string) => api.delete<User>(`/users/${userId}/roles/${code}/`),
    onSuccess: (u) => { refresh(u); toast(t('users.roleRemoved')); },
    onError: (e) => toast(tx(`error.${(e as { code?: string }).code}`, (e as Error).message), 'error'),
  });
  const setPw = useMutation({
    mutationFn: () => api.post(`/users/${userId}/set-password/`, { new_password: password }),
    onSuccess: () => { setPassword(''); toast(t('users.passwordSet')); },
  });
  const u = detail.data;
  const self = u?.id === me?.id;
  const assignable = ROLE_CODES.filter((r) => !u?.roles.includes(r) && (!PRIVILEGED_ROLES.has(r) || can('role.manage')));

  return (
    <Drawer open={!!userId} onClose={onClose} title={u?.full_name || u?.username || '…'} subtitle={u && <Mono>{u.username}</Mono>} width={460}>
      {detail.isPending && <Skeleton rows={4} />}
      {detail.error && <ErrorState error={detail.error} onRetry={() => detail.refetch()} />}
      {u && (
        <div className="space-y-5">
          <div>
            <KV k={t('common.status')} v={<StatusPill status={u.account_status} />} />
            <KV k={t('common.email')} v={u.email || '—'} />
            <KV k={t('users.lastLogin')} v={u.last_login ? fmtDateTime(u.last_login, locale) : t('common.never')} />
          </div>

          <section>
            <h4 className="text-xs font-semibold text-ink2 mb-2">{t('users.roles')}</h4>
            {u.roles.length === 0 && <div className="text-sm text-muted">{t('users.noRoles')}</div>}
            <div className="flex flex-wrap gap-1.5">
              {u.roles.map((r) => (
                <span key={r} className="inline-flex items-center gap-1 h-7 pl-2 pr-1 rounded-md bg-canvas border border-line text-xs">
                  {tx(`role.${r}`, r)}
                  {can('user.update') && (!PRIVILEGED_ROLES.has(r) || can('role.manage')) && (
                    <button type="button" aria-label={`${t('common.remove')} ${r}`} onClick={() => removeRole.mutate(r)} className="w-5 h-5 inline-flex items-center justify-center rounded hover:bg-hover">
                      <X className="w-3 h-3" strokeWidth={1.5} />
                    </button>
                  )}
                </span>
              ))}
            </div>
            {can('user.update') && u.account_status !== 'DISABLED' && (
              <div className="flex gap-2 mt-3">
                <Select value={newRole} onChange={(e) => setNewRole(e.target.value)} className="h-9" aria-label={t('users.addRole')}>
                  <option value="">{t('users.addRole')}…</option>
                  {assignable.map((r) => <option key={r} value={r}>{tx(`role.${r}`, r)}</option>)}
                </Select>
                <Button icon={Plus} disabled={!newRole || addRole.isPending} onClick={() => addRole.mutate()}>{t('common.add')}</Button>
              </div>
            )}
            {!can('role.manage') && <p className="text-[11px] text-muted mt-2">{t('users.privilegedNote')}</p>}
            {addRole.error && <div className="mt-2"><ApiErrorAlert error={addRole.error} /></div>}
          </section>

          {can('user.update') && (
            <section>
              <h4 className="text-xs font-semibold text-ink2 mb-2">{t('users.setPassword')}</h4>
              <div className="flex gap-2">
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" aria-label={t('reset.newPassword')} placeholder={t('reset.newPassword')} />
                <Button icon={KeyRound} disabled={!password || setPw.isPending} onClick={() => setPw.mutate()}>{t('common.save')}</Button>
              </div>
              {setPw.error && <div className="mt-2"><ApiErrorAlert error={setPw.error} /></div>}
            </section>
          )}

          {!self && (
            <section className="flex flex-wrap gap-2 pt-2 border-t border-line">
              {can('user.update') && u.account_status !== 'ACTIVE' && (
                <Button icon={UserCheck} onClick={() => setDialog('activate')}>{t('users.activate')}</Button>
              )}
              {can('user.disable') && u.account_status === 'ACTIVE' && (
                <Button icon={ShieldOff} onClick={() => setDialog('suspend')}>{t('users.suspend')}</Button>
              )}
              {can('user.disable') && u.account_status !== 'DISABLED' && (
                <Button variant="danger" icon={UserX} onClick={() => setDialog('disable')}>{t('users.disable')}</Button>
              )}
            </section>
          )}
        </div>
      )}
      <ReasonDialog
        open={dialog !== null}
        onClose={() => setDialog(null)}
        title={dialog === 'disable' ? t('users.disable') : dialog === 'suspend' ? t('users.suspend') : t('users.activate')}
        description={dialog === 'disable' ? t('users.disableDescription') : dialog === 'suspend' ? t('users.suspendDescription') : undefined}
        confirmLabel={t('common.confirm')}
        danger={dialog === 'disable'}
        optional={dialog === 'activate'}
        onConfirm={async (reason) => {
          const next = await api.post<User>(`/users/${userId}/${dialog}/`, { reason });
          refresh(next);
          toast(t('users.statusChanged'));
        }}
      />
    </Drawer>
  );
}

function UsersScreen() {
  const { t, tx, locale } = useI18n();
  const { can } = useAuth();
  const { get, set } = useUrlState();
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const query = useMemo(() => ({ q: get('q'), role: get('role'), status: get('status'), page: Number(get('page') || 1) }), [get]);
  const list = useQuery({
    queryKey: adminKeys.users(query),
    queryFn: ({ signal }) => api.page<User>('/users/', query, signal),
    placeholderData: keepPreviousData,
  });
  const [search, setSearch] = useState(query.q);

  return (
    <>
      <PageHeader
        title={t('users.title')}
        subtitle={t('users.subtitle')}
        actions={can('user.create') && <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>{t('users.new')}</Button>}
      />
      <Card pad={false}>
        <div className="flex flex-col md:flex-row gap-2 p-3 border-b border-line">
          <form className="flex-1" onSubmit={(e) => { e.preventDefault(); set({ q: search }); }}>
            <SearchInput value={search} onChange={setSearch} />
          </form>
          <Select value={query.role} onChange={(e) => set({ role: e.target.value })} className="h-9 md:w-56" aria-label={t('users.roles')}>
            <option value="">{t('users.filterRole')}</option>
            {ROLE_CODES.map((r) => <option key={r} value={r}>{tx(`role.${r}`, r)}</option>)}
          </Select>
          <Select value={query.status} onChange={(e) => set({ status: e.target.value })} className="h-9 md:w-44" aria-label={t('common.status')}>
            <option value="">{t('users.filterStatus')}</option>
            {ACCOUNT_STATUSES.map((s) => <option key={s} value={s}>{tx(`status.${s}`, s)}</option>)}
          </Select>
        </div>
        {list.isPending ? (
          <Skeleton />
        ) : list.error ? (
          <div className="p-4"><ErrorState error={list.error} onRetry={() => list.refetch()} /></div>
        ) : list.data.data.length === 0 ? (
          <EmptyState title={t('state.noResults')} />
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <thead>
                  <tr>
                    <Th>{t('users.username')}</Th>
                    <Th>{t('users.fullName')}</Th>
                    <Th>{t('users.roles')}</Th>
                    <Th>{t('common.status')}</Th>
                    <Th>{t('users.lastLogin')}</Th>
                  </tr>
                </thead>
                <tbody>
                  {list.data.data.map((u) => (
                    <Tr key={u.id} onClick={() => setSelected(u.id)} selected={selected === u.id}>
                      <Td mono>{u.username}</Td>
                      <Td>
                        <span className="inline-flex items-center gap-2"><Avatar name={u.full_name || u.username} size={26} />{u.full_name || '—'}</span>
                      </Td>
                      <Td><span className="inline-flex flex-wrap gap-1">{u.roles.map((r) => <Badge key={r} mono>{r}</Badge>)}</span></Td>
                      <Td><StatusPill status={u.account_status} /></Td>
                      <Td className="text-ink2 text-xs">{u.last_login ? fmtDateTime(u.last_login, locale) : '—'}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </div>
            <div className="md:hidden">
              {list.data.data.map((u) => (
                <MobileRow
                  key={u.id}
                  onClick={() => setSelected(u.id)}
                  leading={<Avatar name={u.full_name || u.username} />}
                  title={u.full_name || u.username}
                  subtitle={<><Mono className="text-[11px]">{u.username}</Mono> · {u.roles.join(', ') || '—'}</>}
                  trailing={<StatusPill status={u.account_status} />}
                />
              ))}
            </div>
            <Pager page={list.data.meta.page} totalPages={list.data.meta.total_pages} count={list.data.meta.count} pageSize={list.data.meta.page_size} onPage={(n) => set({ page: String(n) })} />
          </>
        )}
      </Card>
      {!can('role.manage') && <div className="mt-3"><Alert tone="info">{t('users.privilegedNote')}</Alert></div>}
      <CreateUserDrawer open={creating} onClose={() => setCreating(false)} />
      <UserDrawer userId={selected} onClose={() => setSelected(null)} />
    </>
  );
}

export default function UsersPage() {
  return (
    <RequirePermission any={['user.view']}>
      <Suspense>
        <UsersScreen />
      </Suspense>
    </RequirePermission>
  );
}

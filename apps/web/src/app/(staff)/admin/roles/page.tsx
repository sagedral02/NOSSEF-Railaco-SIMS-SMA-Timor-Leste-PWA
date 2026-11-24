'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import { useMemo, useState } from 'react';

import { RequirePermission } from '@/components/guards';
import { useToast } from '@/components/toast';
import { Alert, ApiErrorAlert, Badge, Button, Card, Checkbox, Drawer, ErrorState, Mono, PageHeader, Skeleton } from '@/components/ui';
import { adminKeys, type PermissionRow, type Role } from '@/features/admin/api';
import { useAuth } from '@/features/auth/auth';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';

function groupOf(code: string) {
  return code.split('.')[0];
}

function EditPermissions({ role, catalog, onClose }: { role: Role | null; catalog: PermissionRow[]; onClose: () => void }) {
  const { t, tx } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lastRole, setLastRole] = useState<string | null>(null);
  if (role && role.id !== lastRole) {
    setLastRole(role.id);
    setSelected(new Set(role.permissions));
  }
  const save = useMutation({
    mutationFn: () => api.put<Role>(`/roles/${role?.id}/permissions/`, { permissions: [...selected].sort() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminKeys.roles });
      toast(t('roles.saved'));
      onClose();
    },
  });
  const groups = useMemo(() => {
    const map = new Map<string, PermissionRow[]>();
    for (const p of catalog) map.set(groupOf(p.code), [...(map.get(groupOf(p.code)) ?? []), p]);
    return [...map.entries()];
  }, [catalog]);
  const toggle = (code: string, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(code); else next.delete(code);
    setSelected(next);
  };
  return (
    <Drawer
      open={!!role}
      onClose={onClose}
      width={560}
      title={role ? tx(`role.${role.code}`, role.name) : ''}
      subtitle={role && <Mono>{role.code}</Mono>}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={save.isPending} onClick={() => save.mutate()}>{t('common.save')}</Button>
        </>
      }
    >
      <div className="space-y-4">
        {groups.map(([group, perms]) => (
          <fieldset key={group} className="border border-line rounded-md">
            <legend className="px-2 ml-2 text-[11px] font-semibold uppercase tracking-wider text-muted">{group}</legend>
            <div className="px-3 pb-2">
              {perms.map((p) => (
                <label key={p.code} className="flex items-center gap-3 h-9 text-sm">
                  <Checkbox checked={selected.has(p.code)} onChange={(v) => toggle(p.code, v)} label={p.code} />
                  <Mono className="text-xs w-48 shrink-0">{p.code}</Mono>
                  <span className="text-ink2 text-xs truncate">{p.description}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        {save.error && <ApiErrorAlert error={save.error} />}
      </div>
    </Drawer>
  );
}

function RolesScreen() {
  const { t, tx } = useI18n();
  const { can } = useAuth();
  const [editing, setEditing] = useState<Role | null>(null);
  const roles = useQuery({ queryKey: adminKeys.roles, queryFn: () => api.get<Role[]>('/roles/') });
  const catalog = useQuery({ queryKey: adminKeys.catalog, queryFn: () => api.get<PermissionRow[]>('/roles/catalog/') });

  return (
    <>
      <PageHeader title={t('roles.title')} subtitle={t('roles.subtitle')} />
      {!can('role.manage') && <div className="mb-4"><Alert tone="info">{t('roles.readOnly')}</Alert></div>}
      {roles.isPending ? (
        <Card pad={false}><Skeleton /></Card>
      ) : roles.error ? (
        <ErrorState error={roles.error} onRetry={() => roles.refetch()} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {roles.data.map((role) => (
            <Card
              key={role.id}
              title={tx(`role.${role.code}`, role.name)}
              actions={can('role.manage') && <Button size="sm" icon={Pencil} onClick={() => setEditing(role)} disabled={!catalog.data}>{t('roles.editPermissions')}</Button>}
            >
              <div className="flex items-center justify-between mb-2">
                <Mono className="text-xs text-ink2">{role.code}</Mono>
                <span className="text-xs text-ink2">{t('roles.permissionCount', { count: role.permissions.length })}</span>
              </div>
              <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto scroll-thin">
                {role.permissions.map((p) => <Badge key={p} mono className="text-[11px]">{p}</Badge>)}
              </div>
            </Card>
          ))}
        </div>
      )}
      <EditPermissions role={editing} catalog={catalog.data ?? []} onClose={() => setEditing(null)} />
    </>
  );
}

export default function RolesPage() {
  return (
    <RequirePermission any={['user.view', 'role.manage']}>
      <RolesScreen />
    </RequirePermission>
  );
}

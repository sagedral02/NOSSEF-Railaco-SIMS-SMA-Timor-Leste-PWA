'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { RequirePermission } from '@/components/guards';
import { useToast } from '@/components/toast';
import { Badge, Card, Input, PageHeader, Select, Skeleton, Table, Td, Th, Tr } from '@/components/ui';
import { useAuth } from '@/features/auth/auth';
import { schoolToday } from '@/lib/format';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';

interface Person { id: string; full_name: string }
interface Row { id: string; person_type: 'TEACHER' | 'STAFF'; teacher: string | null; staff: string | null; status: string; note: string }
const STATUSES = ['PRESENT', 'LATE', 'SICK', 'PERMITTED', 'ABSENT'];

function StaffAttendanceScreen() {
  const { t, tx } = useI18n();
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [date, setDate] = useState(() => schoolToday());
  const teachers = useQuery({ queryKey: ['teachers', 'active'], queryFn: () => api.get<Person[]>('/staff/teachers/', { employment_status: 'ACTIVE', page_size: 100 }) });
  const staff = useQuery({ queryKey: ['staffprofiles', 'active'], queryFn: () => api.get<Person[]>('/staff/staff/', { employment_status: 'ACTIVE', page_size: 100 }) });
  const rows = useQuery({ queryKey: ['staff-attendance', date], queryFn: () => api.get<Row[]>('/attendance/staff/', { date, page_size: 100 }) });
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post('/attendance/staff/', { ...body, date }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['staff-attendance', date] }); toast(t('common.saved')); },
    onError: (e) => toast((e as Error).message, 'error'),
  });
  const statusOf = (type: string, id: string) => rows.data?.find((r) => (type === 'TEACHER' ? r.teacher : r.staff) === id)?.status ?? '';
  const editable = can('staff.manage');
  const people = [...(teachers.data ?? []).map((p) => ({ ...p, type: 'TEACHER' as const })), ...(staff.data ?? []).map((p) => ({ ...p, type: 'STAFF' as const }))];
  return (
    <>
      <PageHeader title={t('staffAtt.title')} actions={<Input type="date" aria-label={t('common.startDate')} className="h-9 w-auto" value={date} onChange={(e) => setDate(e.target.value)} />} />
      <Card pad={false}>
        {teachers.isPending || rows.isPending ? <Skeleton /> : (
          <Table>
            <thead><tr><Th>{t('staffAtt.person')}</Th><Th>{t('common.type')}</Th><Th>{t('common.status')}</Th></tr></thead>
            <tbody>
              {people.map((p) => (
                <Tr key={`${p.type}-${p.id}`}>
                  <Td>{p.full_name}</Td>
                  <Td><Badge>{p.type === 'TEACHER' ? t('nav.teachers') : t('nav.staff')}</Badge></Td>
                  <Td className="w-56">
                    <Select aria-label={p.full_name} className="h-8" disabled={!editable || save.isPending} value={statusOf(p.type, p.id)}
                      onChange={(e) => e.target.value && save.mutate({ person_type: p.type, [p.type === 'TEACHER' ? 'teacher' : 'staff']: p.id, status: e.target.value })}>
                      <option value="">—</option>
                      {STATUSES.map((s) => <option key={s} value={s}>{tx(`att.status.${s}`, s)}</option>)}
                    </Select>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}

export default function StaffAttendancePage() {
  return (
    <RequirePermission any={['staff.view', 'staff.manage']}>
      <StaffAttendanceScreen />
    </RequirePermission>
  );
}

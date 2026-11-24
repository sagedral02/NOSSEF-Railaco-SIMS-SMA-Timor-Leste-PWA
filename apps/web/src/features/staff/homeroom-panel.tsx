'use client';

// Wali Kelas / Profesor da Turma cards (ui.md SCREEN-07): one card per rombel of the selected year.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Crown, FileSpreadsheet, Phone, Users } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { useToast } from '@/components/toast';
import { ApiErrorAlert, Badge, Button, EmptyState, ErrorState, Field, Modal, Mono, Select, Skeleton } from '@/components/ui';
import { useClassrooms, useSelectedYear, type ClassRoom } from '@/features/academics/api';
import { useAuth } from '@/features/auth/auth';
import type { StudentRow } from '@/features/students/api';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';

function PresidentModal({ room, onClose }: { room: ClassRoom; onClose: () => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const [value, setValue] = useState(room.class_president ?? '');
  const members = useQuery({
    queryKey: ['students', 'list', { classroom_id: room.id, roster: true }],
    queryFn: () => api.page<StudentRow>('/students/', { classroom_id: room.id, academic_year_id: room.academic_year, status: 'ACTIVE', page_size: 100 }),
  });
  const save = useMutation({
    mutationFn: () => api.patch(`/classrooms/${room.id}/`, { class_president: value || null }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['academic'] }); qc.invalidateQueries({ queryKey: ['options'] }); toast(t('common.saved')); onClose(); },
  });
  return (
    <Modal open onClose={onClose} title={`${t('homeroom.setPresident')} · ${room.name}`} size="sm"
      footer={<><Button onClick={onClose}>{t('common.cancel')}</Button><Button variant="primary" disabled={save.isPending} onClick={() => save.mutate()}>{t('common.save')}</Button></>}>
      <Field label={t('student.classPresident')}>
        <Select value={value} onChange={(e) => setValue(e.target.value)} disabled={members.isPending}>
          <option value="">—</option>
          {(members.data?.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.full_name} · {s.student_no}</option>)}
        </Select>
      </Field>
      {save.error && <div className="mt-3"><ApiErrorAlert error={save.error} /></div>}
    </Modal>
  );
}

export function HomeroomPanel() {
  const { t } = useI18n();
  const { can } = useAuth();
  const { year } = useSelectedYear();
  const classes = useClassrooms(year?.id);
  const [editing, setEditing] = useState<ClassRoom | null>(null);
  if (classes.isPending) return <Skeleton rows={4} />;
  if (classes.error) return <ErrorState error={classes.error} onRetry={() => classes.refetch()} />;
  const rooms = classes.data.filter((c) => c.active);
  if (!rooms.length) return <EmptyState />;
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rooms.map((c) => (
          <section key={c.id} className="bg-white border border-line rounded-lg p-5 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-display text-lg font-semibold tracking-tight">{c.name}</h3>
                <Mono className="text-xs text-ink2">{c.code}</Mono>
              </div>
              <div className="flex gap-1"><Badge mono>{c.grade_level_code}</Badge><Badge mono>{c.major_code}</Badge></div>
            </div>
            <dl className="text-sm space-y-1.5">
              <div className="flex justify-between gap-2"><dt className="text-ink2">{t('class.homeroom')}</dt><dd className="text-right font-medium">{c.homeroom_teacher_name ?? '—'}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-ink2 inline-flex items-center gap-1"><Phone size={14} strokeWidth={1.5} aria-hidden />{t('common.phone')}</dt><dd className="text-right"><Mono className="text-xs">{c.homeroom_teacher_phone || '—'}</Mono></dd></div>
              <div className="flex justify-between gap-2"><dt className="text-ink2 inline-flex items-center gap-1"><Crown size={14} strokeWidth={1.5} aria-hidden />{t('student.classPresident')}</dt><dd className="text-right">{c.class_president_name ?? '—'}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-ink2 inline-flex items-center gap-1"><Users size={14} strokeWidth={1.5} aria-hidden />{t('homeroom.students')}</dt><dd className="text-right"><Mono>{c.student_count ?? 0}{c.capacity ? ` / ${c.capacity}` : ''}</Mono></dd></div>
            </dl>
            <div className="flex flex-wrap gap-2 mt-auto pt-2 border-t border-line">
              {can('academic.manage_class') && <Button size="sm" icon={Crown} onClick={() => setEditing(c)}>{t('homeroom.setPresident')}</Button>}
              {can('assessment.view') && (
                <Link href="/grades/gradebook" className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-line-strong bg-white text-xs font-medium hover:bg-hover">
                  <FileSpreadsheet size={14} strokeWidth={1.5} aria-hidden />{t('nav.gradebook')}
                </Link>
              )}
            </div>
          </section>
        ))}
      </div>
      {editing && <PresidentModal room={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

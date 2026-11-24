// Shared select-option sources for academic forms.
import type { FieldDef, Row } from '@/components/resource';

export const gradeOptions: FieldDef['optionsFrom'] = { path: '/grade-levels/', label: (r: Row) => String(r.code) };
export const majorOptions: FieldDef['optionsFrom'] = { path: '/majors/', label: (r: Row) => String(r.name) };
export const subjectOptions: FieldDef['optionsFrom'] = { path: '/subjects/', query: { active: 'true' }, label: (r: Row) => `${r.code} — ${r.name}` };
export const teacherOptions: FieldDef['optionsFrom'] = { path: '/staff/teachers/', query: { employment_status: 'ACTIVE' }, label: (r: Row) => String(r.full_name) };
export const roomOptions: FieldDef['optionsFrom'] = { path: '/rooms/', query: { active: 'true' }, label: (r: Row) => `${r.code} — ${r.name}` };
export const userOptions: FieldDef['optionsFrom'] = { path: '/users/', label: (r: Row) => `${r.username}${r.full_name ? ` — ${r.full_name}` : ''}` };

export function classOptions(yearId?: string): FieldDef['optionsFrom'] {
  return { path: '/classrooms/', query: { academic_year_id: yearId }, label: (r: Row) => String(r.name) };
}
export function offeringOptions(yearId?: string): FieldDef['optionsFrom'] {
  return {
    path: '/subject-offerings/',
    query: { academic_year_id: yearId, active: 'true' },
    label: (r: Row) => `${r.subject_code} — ${r.subject_name} · ${r.grade_level_code} ${r.major_code ?? '*'}`,
  };
}
export function trimesterOptions(yearId?: string): FieldDef['optionsFrom'] {
  return { path: '/trimestres/', query: { academic_year_id: yearId }, label: (r: Row) => String(r.name) };
}

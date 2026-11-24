'use client';

import { useQuery } from '@tanstack/react-query';

import type { Trimester } from '@/features/academics/api';
import { api } from '@/lib/api';

export interface MyAssignment { id: string; classroom: string; classroom_id: string; subject_code: string; subject_name: string; teacher: string; academic_year_id: string }
export interface Component { id: string; assessment_type: string; assessment_type_code: string; name: string; weight_percent: string; sequence: number; is_cau_component: boolean }
export interface Scheme {
  id: string; trimester: string; trimester_number: number; subject_offering: string; subject_code: string; grade_level_code: string; major_code: string | null;
  name: string; status: string; passing_score: string; passing_inclusive: boolean; scale_max: string; precision: number; aggregation: string;
  absent_policy: string; remedial_policy: string; components: Component[];
}
export interface Assessment {
  id: string; teaching_assignment: string; trimester: string; type_code: string; grading_component: string; component_name: string; title: string;
  assessment_date: string; max_score: string; cau_number: number | null; is_remedial: boolean; status: string; version: number; graded: number;
}
export interface TermGrade {
  id: string; student: string; student_name: string; student_no: string; trimester: string; trimester_number: number; teaching_assignment: string;
  subject_code: string; subject_name: string; calculated_score: string | null; final_score: string | null; grade_label: string; status: string;
  override_reason: string; finalized_at: string | null; version: number;
}
export interface ScoreCell { score: string | null; status: string; version: number }
export interface GradebookStudent {
  student_id: string; student_no: string; full_name: string; scores: Record<string, ScoreCell | null>;
  preview: { final: string | null; complete: boolean; missing: string[]; components: { name: string; weight: string; percent: string | null }[] } | null;
  term_grade: TermGrade | null;
}
export interface Gradebook {
  teaching_assignment: { id: string; classroom: string; subject_code: string; subject_name: string; teacher: string };
  trimester: { id: string; number: number; status: string; grade_entry_start: string | null; grade_entry_end: string | null };
  can_edit: boolean; can_finalize: boolean; can_reopen: boolean; scheme: Scheme | null; assessments: Assessment[]; students: GradebookStudent[];
}
export interface ImportJob {
  id: string; import_type: string; status: string; total_rows: number; valid_rows: number; invalid_rows: number; error_code: string;
  preview: { row: number; student_no: string; full_name: string; values: Record<string, { status: string; score: string | null }> }[];
  result: { changed?: number; errors?: number; same_file_as?: string; message?: string }; result_file: string | null; source_name: string;
  row_errors: { row_number: number; field_name: string; error_code: string; message: string; raw_value: string }[];
}

export const gradeKeys = {
  myAssignments: (yearId?: string) => ['grades', 'my-assignments', yearId] as const,
  gradebook: (ta?: string, tr?: string) => ['grades', 'gradebook', ta, tr] as const,
};

export function useMyAssignments(yearId?: string) {
  return useQuery({
    queryKey: gradeKeys.myAssignments(yearId),
    queryFn: () => api.get<MyAssignment[]>('/gradebook/my-assignments/', { academic_year_id: yearId }),
    enabled: !!yearId,
    staleTime: 60_000,
  });
}

/** Default trimester for grade screens: ACTIVE, else the latest GRADING, else the first. */
export function defaultTrimester(trimesters: Trimester[]) {
  return trimesters.find((t) => t.status === 'ACTIVE') ?? [...trimesters].reverse().find((t) => t.status === 'GRADING') ?? trimesters[0];
}

/** Scheme pass rule as text, e.g. "> 5 / 10". */
export function passRule(s: Pick<Scheme, 'passing_score' | 'passing_inclusive' | 'scale_max'>) {
  return `${s.passing_inclusive ? '≥' : '>'} ${Number(s.passing_score)} / ${Number(s.scale_max)}`;
}

export function isPassing(score: string | null | undefined, s: Pick<Scheme, 'passing_score' | 'passing_inclusive'> | null | undefined) {
  if (score == null || !s) return null;
  const v = Number(score), p = Number(s.passing_score);
  return s.passing_inclusive ? v >= p : v > p;
}

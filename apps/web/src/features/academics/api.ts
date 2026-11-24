'use client';

import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { setPreference, usePreference } from '@/lib/storage';

export interface Trimester {
  id: string; academic_year: string; number: number; name: string; start_date: string; end_date: string;
  grade_entry_start: string | null; grade_entry_end: string | null; status: string; cau_number: number;
}
export interface AcademicYear { id: string; name: string; start_date: string; end_date: string; status: string; is_current: boolean; trimesters: Trimester[] }
export interface GradeLevel { id: string; code: string; sequence: number; active: boolean }
export interface Major { id: string; code: string; name: string; active: boolean }
export interface ClassRoom {
  id: string; academic_year: string; grade_level: string; grade_level_code: string; major: string; major_code: string; name: string; code: string;
  homeroom_teacher: string | null; homeroom_teacher_name: string | null; default_room: string | null; default_room_code: string | null;
  capacity: number | null; active: boolean;
  class_president?: string | null; class_president_name?: string | null; homeroom_teacher_phone?: string | null; student_count?: number;
}

export const academicKeys = {
  years: ['academic', 'years'] as const,
  grades: ['academic', 'grades'] as const,
  majors: ['academic', 'majors'] as const,
  classes: (yearId?: string) => ['academic', 'classes', yearId] as const,
};

export function useYears(enabled = true) {
  return useQuery({ queryKey: academicKeys.years, queryFn: () => api.get<AcademicYear[]>('/academic-years/'), enabled, staleTime: 60_000 });
}
export function useGradeLevels() {
  return useQuery({ queryKey: academicKeys.grades, queryFn: () => api.get<GradeLevel[]>('/grade-levels/'), staleTime: 300_000 });
}
export function useMajors() {
  return useQuery({ queryKey: academicKeys.majors, queryFn: () => api.get<Major[]>('/majors/'), staleTime: 300_000 });
}
export function useClassrooms(yearId?: string) {
  return useQuery({
    queryKey: academicKeys.classes(yearId),
    queryFn: () => api.get<ClassRoom[]>('/classrooms/', { academic_year_id: yearId }),
    enabled: !!yearId,
    staleTime: 60_000,
  });
}

const YEAR_KEY = 'nossef.year';

/** Selected academic year for staff screens: user's choice, else the current year. */
export function useSelectedYear() {
  const years = useYears();
  const saved = usePreference(YEAR_KEY, '');
  const list = years.data ?? [];
  const year = list.find((y) => y.id === saved) ?? list.find((y) => y.is_current) ?? list[0];
  return {
    year,
    years: list,
    loading: years.isPending,
    error: years.error,
    setYear: (id: string) => setPreference(YEAR_KEY, id),
    activeTrimester: year?.trimesters.find((t) => t.status === 'ACTIVE') ?? null,
  };
}

'use client';

// Public applicant helpers. Registrations are remembered on this device (registration number + access code)
// so applicants can continue or check results without retyping; the code only unlocks that one application.
import { api } from '@/lib/api';
import { setPreference, usePreference } from '@/lib/storage';

export interface PublicPeriod {
  id: string; name: string; academic_year_name: string; registration_start: string; registration_end: string;
  required_documents: string[]; document_labels: Record<string, string>; majors: { id: string; code: string; name: string }[];
}
export interface ApplicantGuardian { id?: string; full_name: string; relationship: string; phone: string; email?: string; occupation?: string; address?: string; is_primary: boolean }
export interface ApplicantDocument { id: string; document_type: string; file: string; original_name: string; verification_status: string; note: string }
export interface Applicant {
  id: string; registration_no: string; full_name: string; birth_date: string; birth_place: string; gender: string; previous_school: string;
  phone: string; email: string; address: string; desired_major: string | null; desired_major_code: string | null; status: string;
  submitted_at: string | null; admission_period: string; period_name: string; guardians: ApplicantGuardian[]; documents: ApplicantDocument[];
  required_documents: string[]; decision: { decision: string; score: string | null; rank: number | null; note: string; decided_at: string } | null;
  decision_score: string | null; decision_rank: number | null; student: string | null; student_no: string | null; re_registered_at: string | null;
  created_at: string;
}

export interface SavedRegistration { registration_no: string; access_token: string; full_name: string; birth_date: string; status: string; at: string }
const KEY = 'nossef.ppdb.registrations';

export function useSavedRegistrations(): SavedRegistration[] {
  const raw = usePreference(KEY, '[]');
  try {
    return JSON.parse(raw) as SavedRegistration[];
  } catch {
    return [];
  }
}

export function rememberRegistration(entry: SavedRegistration, current: SavedRegistration[]) {
  const next = [entry, ...current.filter((x) => x.registration_no !== entry.registration_no)].slice(0, 10);
  setPreference(KEY, JSON.stringify(next));
}

export const publicApi = {
  periods: () => api.get<PublicPeriod[]>('/admissions/public/periods/'),
  create: (body: unknown) => api.post<{ registration_no: string; access_token: string; applicant: Applicant }>('/admissions/public/applicants/', body),
  get: (reg: string, token: string) => api.getWith<Applicant>(`/admissions/public/applicants/${reg}/`, { headers: { 'X-Applicant-Token': token } }),
  update: (reg: string, token: string, body: unknown) =>
    api.patch<Applicant>(`/admissions/public/applicants/${reg}/`, body, { headers: { 'X-Applicant-Token': token } }),
  upload: (reg: string, token: string, documentType: string, file: File) => {
    const form = new FormData();
    form.append('document_type', documentType);
    form.append('file', file);
    return api.post<Applicant>(`/admissions/public/applicants/${reg}/documents/`, form, { headers: { 'X-Applicant-Token': token } });
  },
  submit: (reg: string, token: string) => api.post<Applicant>(`/admissions/public/applicants/${reg}/submit/`, undefined, { headers: { 'X-Applicant-Token': token } }),
  status: (registration_no: string, birth_date: string) =>
    api.post<{ registration_no: string; full_name: string; status: string; period: string; decision_published: boolean; submitted_at: string | null;
      missing_documents: string[]; invalid_documents: { document_type: string; note: string }[] }>('/admissions/public/status/', { registration_no, birth_date }),
  recover: (body: { full_name: string; birth_date: string; guardian_phone: string }) =>
    api.post<{ registration_no: string }>('/admissions/public/recover/', body),
};

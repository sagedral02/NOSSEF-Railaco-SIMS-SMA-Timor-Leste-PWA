export interface Enrollment {
  id: string; academic_year: string; academic_year_name: string; grade_level: string; grade_level_code: string; major: string; major_code: string;
  classroom: string; classroom_name: string; status: string; start_date: string; end_date: string | null; source: string;
}
export interface StudentRow {
  id: string; student_no: string; national_student_no: string | null; full_name: string; gender: string; birth_date: string; status: string;
  current_enrollment: Enrollment | null;
}
export interface StudentDetail extends StudentRow {
  birth_place?: string; address?: string; phone?: string; email?: string; admission_date: string; photo_file: string | null; username: string | null;
}
export interface Guardian { id: string; full_name: string; phone: string; email: string; address: string; occupation: string; active: boolean; username: string | null }
export interface GuardianLink { id: string; guardian: Guardian; relationship: string; is_primary: boolean; receives_notifications: boolean; financial_contact: boolean; active: boolean }
export interface StatusHistory { id: string; from_status: string; to_status: string; effective_date: string; reason: string; changed_by_username: string | null; created_at: string }
export interface TransferRecord { id: string; transfer_type: string; effective_date: string; from_detail: Record<string, string> | null; to_detail: Record<string, string> | null; reason: string; document_file: string | null; created_at: string }

export interface StudentDocument { category: string; title: string; reference: string; date: string; file: { id: string; original_name: string; mime_type: string; size_bytes: number } }

export const studentKeys = {
  list: (q: Record<string, unknown>) => ['students', 'list', q] as const,
  detail: (id: string) => ['students', 'detail', id] as const,
  sub: (id: string, part: string) => ['students', 'detail', id, part] as const,
};

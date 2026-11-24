export type Role =
  | 'SUPER_ADMIN' | 'SCHOOL_ADMIN' | 'SECRETARY' | 'PRINCIPAL' | 'CURRICULUM_ADMIN' | 'FINANCE_ADMIN' | 'ADMISSION_OFFICER'
  | 'TEACHER' | 'HOMEROOM_TEACHER' | 'COUNSELOR' | 'LIBRARIAN' | 'ASSET_OFFICER' | 'STUDENT' | 'GUARDIAN';

export interface User {
  id: string; username: string; email: string; name: string; roles: Role[]; profileType: string | null; profileId: string | null;
  status: 'ACTIVE' | 'SUSPENDED' | 'DISABLED'; lastLogin: string | null; permissions: string[]; roleValidFrom?: string; roleValidUntil?: string;
}
export interface Enrollment { year: string; grade: number; major: string; className: string; status: string; source: string; from?: string }
export interface Transfer { type: string; fromClass?: string; toClass?: string; effectiveDate: string; reason: string; approvedBy: string; at: string; document?: { id: string; name: string; mime: string } | null }
export interface Student {
  id: string; studentNo: string; nationalNo: string; name: string; gender: 'M' | 'F'; birthDate: string; birthPlace: string; address: string;
  classId: string; grade: number; major: 'CT' | 'CSH'; status: string; scholarship: 'MERITO' | 'JESUITA' | 'SOSIAL' | null; guardianId: string | null;
  entryYear: number; religion?: string; enrollments: Enrollment[]; transfers: Transfer[];
}
export interface Guardian { id: string; name: string; relation: string; phone: string; occupation: string; studentIds: string[] }
export interface Teacher {
  id: string; employeeNo: string; name: string; gender: string; category: 'FUNCIONARIO' | 'KONTRATADU' | 'PART_TIME'; specialization: string; subjectIds: string[];
  hoursPerWeek: number; status: string; phone: string; email: string; education?: string; joinedYear?: number; skNo?: string; portalStatus?: string;
}
export interface Staff { id: string; employeeNo: string; name: string; position: string; phone: string; status: string }
export interface ClassRoom { id: string; name: string; grade: number; major: 'CT' | 'CSH'; homeroomTeacherId: string; roomId: string; chefeStudentId: string | null; yearId: string }
export interface Subject { id: string; code: string; name: string; majors: string[]; weeklyPeriods: number; credit: number }
export interface Room { id: string; code: string; name: string; capacity: number }
export interface BellPeriod { id: string; order: number; start: string; end: string }
export interface Trimester { id: string; yearId: string; number: number; cau: number; start: string; end: string; gradeWindowStart: string; gradeWindowEnd: string; status: string }
export interface AcademicYear { id: string; name: string; start: string; end: string; status: string }
export interface TeachingAssignment { id: string; teacherId: string; classId: string; subjectId: string; weeklyPeriods: number }
export interface ScheduleEntry { id: string; classId: string; day: number; period: number; subjectId: string; teacherId: string; roomId: string; exception: null | { type: string; date: string; substituteTeacherId: string | null; note: string } }
export interface Score { id: string; studentId: string; classId: string; subjectId: string; trimester: number; tpc: number | null; t1: number | null; t2: number | null; ezame: number | null; final: number | null; situation: string | null; observation?: string }
export interface TermGrade { id: string; classId: string; subjectId: string; trimester: number; status: 'DRAFT' | 'FINALIZED'; finalizedAt: string | null }
export interface PautaSubmission { id: string; protocol: string; teacherId: string; classId: string; subjectId: string; trimester: number; fileName: string; fileId?: string | null; rowsTotal: number; rowsValid: number; submittedAt: string; status: string; reviewedBy: string | null; reviewNote: string }
export interface ReportCard { id: string; studentId: string; trimester: number; status: string; revision: number; homeroomNote: string; publishedAt: string | null; verifyToken: string; reopenReason?: string }
export interface AttRecord { status: 'PRESENT' | 'SICK' | 'PERMITTED' | 'ABSENT' | 'LATE'; minutesLate?: number; note?: string; changedBy?: string; changedAt?: string }
export interface AttendanceSession { id: string; classId: string; date: string; mode: string; subjectId: string | null; status: string; version: number; recordedBy: string; records: Record<string, AttRecord> }
export interface FeePlan { id: string; grade: number; label: string; etapa1: number; etapa2: number; total: number }
export interface Invoice { id: string; invoiceNo: string; studentId: string; period: string; etapa: number; subtotal: number; discount: number; total: number; paid: number; status: string; dueDate: string; issuedAt: string }
export interface Payment { id: string; paymentNo: string; studentId: string; method: 'CASH' | 'BANK_RECEIPT'; bank: string | null; amount: number; status: string; allocations: { invoiceId: string; amount: number }[]; proofRef: string | null; proofFileId?: string | null; depositDate?: string | null; receivedAt: string; receiptNo: string | null; receivedBy: string; reversalReason: string | null; rejectReason?: string }
export interface Applicant {
  id: string; regNo: string; name: string; gender: string; birthPlace: string; birthDate: string; origin: string; phone: string; email: string; address: string; majorPref: 'CT' | 'CSH'; avgScore: number | null;
  guardian: { name: string; relation: string; occupation: string; phone: string; primary: boolean };
  documents: { type: string; label: string; fileName: string; sizeKb: number; status: string; reason?: string; fileId?: string | null }[]; testScore: number | null; rank: number | null; status: string; submittedAt: string; decisionNote: string; periodId: string;
}
export interface CounselingCase { id: string; caseNo: string; studentId: string; category: string; severity: string; counselorStaffId: string; status: string; openedAt: string; summary: string; chronology?: string; followUps: { at: string; by: string; note: string; kind?: string }[]; guardianMeeting: string | null }
export interface DisciplineIncident { id: string; incidentNo: string; studentId: string; occurredAt: string; category: string; severity: string; actionTaken: string; status: string; reportedBy: string }
export interface Activity { id: string; unit: string; name: string; advisorTeacherId: string; capacity: number; schedule: string; generation: string }
export interface Membership { id: string; activityId: string; studentId: string; role: string; joinedAt: string; status: string }
export interface LibraryBook { id: string; isbn: string; title: string; author: string; category: string; year: number | null }
export interface LibraryCopy { id: string; bookId: string; barcode: string; status: string; acquiredAt: string }
export interface Loan { id: string; copyId: string; borrowerType: 'STUDENT' | 'TEACHER'; borrowerId: string; borrowedAt: string; dueAt: string; returnedAt: string | null; fine: number; condition: string | null; status: string; renewals: number }
export interface Asset { id: string; assetNo: string; name: string; serial: string; category: string; roomId: string | null; assignee: string | null; condition: string; cost: number; status: string; acquiredAt: string; history: { at: string; type: string; note: string }[] }
export interface Announcement { id: string; title: string; body: string; audience: string[]; status: string; publishAt: string | null; author: string; push: boolean; attachment?: { id: string; name: string; mime: string } | null }
export interface Notification { id: string; target: string; event: string; title: string; body: string; at: string; read: boolean; link: string }
export interface AuditLog { id: string; at: string; actor: string; eventType: string; target: string; before: unknown; after: unknown; requestId: string; ip: string }
export interface Job { id: string; kind: string; code: string; name: string; format: string; status: string; progress: number; createdAt: string; by: string; error?: string | null; result?: { imported: number; skipped: number }; fileId?: string | null; sourceFileId?: string | null; rows?: number; finishedAt?: string; params?: { classId?: string; trimester?: number } }
export interface School { name: string; short: string; address: string; phone: string; email: string; timezone: string; currency: string; defaultLang: string; founded: number; activeYear: string; activeTrimester: number }

export interface DB {
  school: School; academicYears: AcademicYear[]; trimesters: Trimester[]; majors: { id: string; code: string; name: string; alias: string }[];
  rooms: Room[]; bellPeriods: BellPeriod[]; subjects: Subject[]; teachers: Teacher[]; staff: Staff[]; classes: ClassRoom[]; guardians: Guardian[]; students: Student[];
  teachingAssignments: TeachingAssignment[]; schedule: ScheduleEntry[]; scores: Score[]; termGrades: TermGrade[]; pautaSubmissions: PautaSubmission[];
  reportCards: ReportCard[]; promotions: { studentId: string; decision: string; reason?: string; toMajor?: string; decidedBy: string; at: string }[];
  nationalExams: { id: string; studentId: string; candidateNo: string; status: string; overallScore: number | null; certificateNo: string | null }[];
  attendanceSessions: AttendanceSession[]; leaveRequests: { id: string; studentId: string; from: string; to: string; type: string; reason: string; status: string; submittedBy: string; attachmentFileId?: string | null }[];
  feePlans: FeePlan[]; scholarshipTypes: { code: string; name: string; discountPct: number }[]; invoices: Invoice[]; payments: Payment[];
  admissionPeriods: { id: string; name: string; open: string; close: string; status: string; quota: number }[]; applicants: Applicant[];
  counselingCases: CounselingCase[]; disciplineIncidents: DisciplineIncident[]; activities: Activity[]; memberships: Membership[];
  libraryBooks: LibraryBook[]; libraryCopies: LibraryCopy[]; loans: Loan[]; assets: Asset[]; announcements: Announcement[];
  calendarEvents: { id: string; date: string; title: string; type: string }[]; notifications: Notification[]; reportJobs: Job[];
  archive: { year: number; enrolled: number; male: number; female: number; graduates: number; ctGrad: number; cshGrad: number; passRate: number | null }[];
  alumni: { id: string; studentNo: string; name: string; gender: string; gradYear: number; major: string; finalAvg: number; destination: string }[];
  auditLogs: AuditLog[]; users: User[];
}

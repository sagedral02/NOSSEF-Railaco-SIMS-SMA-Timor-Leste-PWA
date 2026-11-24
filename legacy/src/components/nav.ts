import {
  Award, BarChart3, BookOpen, Briefcase, CalendarDays, ClipboardCheck, CreditCard, FileSpreadsheet, Flag, HeartHandshake, Home, LayoutDashboard,
  Library, Megaphone, Package, Settings, User, UserPlus, Users, Wallet, type LucideIcon,
} from 'lucide-react';
import type { Role } from '../lib/types';

export interface NavItem { key: string; to: string; icon: LucideIcon; group: string; perm?: string[]; roles?: Role[]; match?: string }
export const NAV: NavItem[] = [
  { key: 'nav.myHome', to: '/student/home', icon: Home, group: 'main', roles: ['STUDENT'], match: '/student' },
  { key: 'nav.myHome', to: '/guardian/home', icon: Home, group: 'main', roles: ['GUARDIAN'], match: '/guardian' },
  { key: 'nav.dashboard', to: '/dashboard', icon: LayoutDashboard, group: 'main', perm: ['student.view', 'finance.view', 'academic.view', 'library.view', 'asset.view', 'counseling.view', 'admission.view', 'user.view'] },
  { key: 'nav.announcements', to: '/announcements', icon: Megaphone, group: 'main', perm: ['announcement.view'] },
  { key: 'nav.admissions', to: '/admissions/applicants', icon: UserPlus, group: 'academic', perm: ['admission.view'], match: '/admissions' },
  { key: 'nav.students', to: '/students', icon: Users, group: 'academic', perm: ['student.view'] },
  { key: 'nav.staff', to: '/staff', icon: Briefcase, group: 'academic', perm: ['staff.view'] },
  { key: 'nav.academic', to: '/academic', icon: BookOpen, group: 'academic', perm: ['academic.view'] },
  { key: 'nav.schedule', to: '/schedules', icon: CalendarDays, group: 'academic', perm: ['schedule.view'] },
  { key: 'nav.attendance', to: '/attendance', icon: ClipboardCheck, group: 'academic', perm: ['attendance.view'] },
  { key: 'nav.grades', to: '/grades', icon: FileSpreadsheet, group: 'academic', perm: ['assessment.view'] },
  { key: 'nav.reports', to: '/reports/report-cards', icon: Award, group: 'academic', perm: ['report.view'], match: '/reports/' },
  { key: 'nav.finance', to: '/finance', icon: Wallet, group: 'operations', perm: ['finance.view'] },
  { key: 'nav.counseling', to: '/counseling', icon: HeartHandshake, group: 'operations', perm: ['counseling.view', 'discipline.view', 'counseling.summary'] },
  { key: 'nav.library', to: '/library', icon: Library, group: 'operations', perm: ['library.view'] },
  { key: 'nav.assets', to: '/assets', icon: Package, group: 'operations', perm: ['asset.view'] },
  { key: 'nav.extracurricular', to: '/extracurricular', icon: Flag, group: 'nossef', perm: ['extracurricular.view'] },
  { key: 'nav.reportsCenter', to: '/reports-center', icon: BarChart3, group: 'system', perm: ['system.view_jobs', 'system.import'] },
  { key: 'nav.admin', to: '/admin', icon: Settings, group: 'system', perm: ['user.view', 'audit.view'] },
];
export const GROUPS = ['main', 'academic', 'operations', 'nossef', 'system'];

/** Mobile bottom tabs (4 + Menu) per role, per ui.md. */
export function bottomTabs(roles: Role[]): { label: string; to: string; icon: LucideIcon }[] {
  if (roles.includes('STUDENT'))
    return [
      { label: 'Beranda', to: '/student/home', icon: Home },
      { label: 'Jadwal', to: '/student/schedule', icon: CalendarDays },
      { label: 'Nilai', to: '/student/grades', icon: Award },
      { label: 'SPP', to: '/student/finance', icon: CreditCard },
      { label: 'Profil', to: '/student/profile', icon: User },
    ];
  if (roles.includes('GUARDIAN'))
    return [
      { label: 'Beranda', to: '/guardian/home', icon: Home },
      { label: 'Presensi', to: '/guardian/attendance', icon: ClipboardCheck },
      { label: 'Rapor', to: '/guardian/report-cards', icon: Award },
      { label: 'SPP', to: '/guardian/finance', icon: CreditCard },
    ];
  if (roles.some((r) => r === 'TEACHER' || r === 'HOMEROOM_TEACHER'))
    return [
      { label: 'Beranda', to: '/dashboard', icon: LayoutDashboard },
      { label: 'Jadwal', to: '/schedules', icon: CalendarDays },
      { label: 'Absensi', to: '/attendance', icon: ClipboardCheck },
      { label: 'Nilai', to: '/grades', icon: FileSpreadsheet },
    ];
  if (roles.includes('FINANCE_ADMIN'))
    return [
      { label: 'Beranda', to: '/dashboard', icon: LayoutDashboard },
      { label: 'Invoice', to: '/finance?tab=invoices', icon: Wallet },
      { label: 'Kasir', to: '/finance?tab=cashier', icon: CreditCard },
      { label: 'Siswa', to: '/students', icon: Users },
    ];
  return [
    { label: 'Beranda', to: '/dashboard', icon: LayoutDashboard },
    { label: 'Siswa', to: '/students', icon: Users },
    { label: 'Absen', to: '/attendance', icon: ClipboardCheck },
    { label: 'Nilai', to: '/grades', icon: FileSpreadsheet },
  ];
}
export const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin', SCHOOL_ADMIN: 'Admin Sekolah', SECRETARY: 'Sekretaria', PRINCIPAL: 'Diretora Geral', CURRICULUM_ADMIN: 'Vise-Diretora Pedagójika',
  FINANCE_ADMIN: 'Finansas / Tesoureiro', ADMISSION_OFFICER: 'Ofisiál Admisaun', TEACHER: 'Professór', HOMEROOM_TEACHER: 'Profesor da Turma', COUNSELOR: 'Konselor BK',
  LIBRARIAN: 'Bibliotekáriu', ASSET_OFFICER: 'Ofisiál Patrimóniu', STUDENT: 'Estudante', GUARDIAN: 'Inan-Aman / Wali',
};

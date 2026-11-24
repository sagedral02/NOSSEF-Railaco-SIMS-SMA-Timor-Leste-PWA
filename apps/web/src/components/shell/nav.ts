// Permission-aware navigation (F1-12). Hiding an item is UX only; the API enforces access.
import {
  CalendarClock, ClipboardCheck, FileClock, Settings2, UserCheck,
  BookOpen, Briefcase, ClipboardList, UserPlus,  CalendarDays, CalendarRange, DoorOpen, GraduationCap, Layers, LayoutDashboard, ListChecks, ScrollText, School, Shield,
  User, UserCog, Users, FileBarChart2, FileUp, Megaphone, Bell, BookMarked, CalendarCheck, MessageSquareWarning, BookCopy, Library, Package, HeartHandshake, ShieldAlert, Trophy, Wallet, Receipt, Banknote, AlertTriangle, BadgePercent, NotebookPen, Gauge, Scale, FileText, TrendingUp, Award, Activity, type LucideIcon,
} from 'lucide-react';

import type { MessageKey } from '@/i18n';

export interface NavItem {
  key: MessageKey;
  href: string;
  icon: LucideIcon;
  group: Group;
  /** Visible when the user holds any of these permissions; undefined = every authenticated user. */
  perm?: string[];
  /** Alternatively visible to these roles (portal users hold no staff permissions). */
  roles?: string[];
  match?: string;
  /** Active only on the exact path (section landing pages). */
  exact?: boolean;
}
export type Group = 'main' | 'academic' | 'operations' | 'nossef' | 'system';
export const GROUPS: Group[] = ['main', 'academic', 'operations', 'nossef', 'system'];

export const NAV: NavItem[] = [
  { key: 'nav.dashboard', href: '/dashboard', icon: LayoutDashboard, group: 'main' },
  { key: 'nav.profile', href: '/profile', icon: User, group: 'main' },
  { key: 'nav.attendance', href: '/attendance/today', icon: ClipboardCheck, group: 'main', perm: ['attendance.record'] },
  { key: 'nav.schedule', href: '/schedules', icon: CalendarClock, group: 'main', perm: ['schedule.view'], match: '/schedules' },
  { key: 'nav.gradebook', href: '/grades/gradebook', icon: NotebookPen, group: 'main', perm: ['assessment.view'] },
  { key: 'nav.announcements', href: '/announcements', icon: Megaphone, group: 'main', exact: true },
  { key: 'nav.notifications', href: '/notifications', icon: Bell, group: 'main' },
  { key: 'nav.mySchedule', href: '/my/schedule', icon: CalendarClock, group: 'main', roles: ['GUARDIAN', 'STUDENT'] },
  { key: 'nav.myReports', href: '/my/report-cards', icon: BookMarked, group: 'main', roles: ['GUARDIAN', 'STUDENT'] },
  { key: 'nav.myAttendance', href: '/my/attendance', icon: CalendarCheck, group: 'main', roles: ['GUARDIAN', 'STUDENT'] },
  { key: 'nav.myNotices', href: '/my/notices', icon: MessageSquareWarning, group: 'main', roles: ['GUARDIAN'] },
  { key: 'nav.myLoans', href: '/my/loans', icon: BookCopy, group: 'main', roles: ['GUARDIAN', 'STUDENT'] },
  { key: 'nav.myFinance', href: '/my/finance', icon: Wallet, group: 'main', roles: ['GUARDIAN', 'STUDENT'] },
  { key: 'nav.students', href: '/students', icon: Users, group: 'academic', perm: ['student.view'] },
  { key: 'nav.admissions', href: '/admissions/applicants', icon: UserPlus, group: 'academic', perm: ['admission.view'] },
  { key: 'nav.admissionPeriods', href: '/admissions/periods', icon: ClipboardList, group: 'academic', perm: ['admission.view'] },
  { key: 'nav.years', href: '/academic/years', icon: CalendarRange, group: 'academic', perm: ['academic.view'] },
  { key: 'nav.classes', href: '/academic/classes', icon: GraduationCap, group: 'academic', perm: ['academic.view'] },
  { key: 'nav.subjects', href: '/academic/subjects', icon: BookOpen, group: 'academic', perm: ['academic.view'] },
  { key: 'nav.offerings', href: '/academic/offerings', icon: Layers, group: 'academic', perm: ['academic.view'] },
  { key: 'nav.assignments', href: '/academic/teaching-assignments', icon: ListChecks, group: 'academic', perm: ['academic.view'] },
  { key: 'nav.calendar', href: '/academic/calendar', icon: CalendarDays, group: 'academic', perm: ['academic.view', 'schedule.view'] },
  { key: 'nav.rooms', href: '/academic/rooms', icon: DoorOpen, group: 'academic', perm: ['academic.view'] },
  { key: 'nav.scheduleManage', href: '/schedules/manage', icon: Settings2, group: 'academic', perm: ['schedule.manage'] },
  { key: 'nav.completion', href: '/grades/completion', icon: Gauge, group: 'academic', perm: ['assessment.view'] },
  { key: 'nav.schemes', href: '/grades/schemes', icon: Scale, group: 'academic', perm: ['assessment.view'] },
  { key: 'nav.reportCards', href: '/reports/report-cards', icon: FileText, group: 'academic', perm: ['report.view', 'report.generate'] },
  { key: 'nav.promotion', href: '/promotion', icon: TrendingUp, group: 'academic', perm: ['report.view'] },
  { key: 'nav.nationalExams', href: '/national-exams', icon: Award, group: 'academic', perm: ['report.view', 'student.view'] },
  { key: 'nav.finance', href: '/finance', icon: Banknote, group: 'operations', perm: ['finance.view'], exact: true },
  { key: 'nav.invoices', href: '/finance/invoices', icon: Receipt, group: 'operations', perm: ['finance.view'] },
  { key: 'nav.payments', href: '/finance/payments', icon: Wallet, group: 'operations', perm: ['finance.view'] },
  { key: 'nav.arrears', href: '/finance/arrears', icon: AlertTriangle, group: 'operations', perm: ['finance.view'] },
  { key: 'nav.fees', href: '/finance/fees', icon: BadgePercent, group: 'operations', perm: ['finance.view'] },
  { key: 'nav.attendanceReview', href: '/attendance/review', icon: UserCheck, group: 'operations', perm: ['attendance.view'] },
  { key: 'nav.leave', href: '/attendance/leave', icon: FileClock, group: 'operations', perm: ['attendance.view', 'attendance.approve'] },
  { key: 'nav.staffAttendance', href: '/attendance/staff', icon: ClipboardCheck, group: 'operations', perm: ['staff.manage'] },
  { key: 'nav.counseling', href: '/counseling', icon: HeartHandshake, group: 'operations', perm: ['counseling.view'] },
  { key: 'nav.discipline', href: '/discipline', icon: ShieldAlert, group: 'operations', perm: ['discipline.view', 'discipline.manage'] },
  { key: 'nav.extracurricular', href: '/extracurricular', icon: Trophy, group: 'operations', perm: ['extracurricular.view'] },
  { key: 'nav.library', href: '/library', icon: Library, group: 'operations', perm: ['library.view', 'library.issue'] },
  { key: 'nav.assets', href: '/assets', icon: Package, group: 'operations', perm: ['asset.view'] },
  { key: 'nav.teachers', href: '/staff/teachers', icon: Briefcase, group: 'operations', perm: ['staff.view'] },
  { key: 'nav.staff', href: '/staff/staff', icon: UserCog, group: 'operations', perm: ['staff.view'] },
  { key: 'nav.reports', href: '/reports', icon: FileBarChart2, group: 'system', perm: ['report.view', 'student.view', 'attendance.view', 'finance.view', 'academic.view', 'library.view', 'asset.view', 'admission.view', 'counseling.view'], exact: true },
  { key: 'nav.imports', href: '/imports', icon: FileUp, group: 'system', perm: ['system.import', 'student.create', 'staff.manage', 'academic.manage_subject', 'library.manage_catalog', 'asset.manage'] },
  { key: 'nav.announcementsManage', href: '/announcements/manage', icon: Megaphone, group: 'system', perm: ['announcement.publish'] },
  { key: 'nav.users', href: '/admin/users', icon: Users, group: 'system', perm: ['user.view'] },
  { key: 'nav.roles', href: '/admin/roles', icon: Shield, group: 'system', perm: ['user.view', 'role.manage'] },
  { key: 'nav.school', href: '/admin/school', icon: School, group: 'system', perm: ['school.view'] },
  { key: 'nav.jobs', href: '/admin/jobs', icon: Activity, group: 'system', perm: ['system.view_jobs'] },
  { key: 'nav.audit', href: '/admin/audit', icon: ScrollText, group: 'system', perm: ['audit.view'] },
];

export function visibleNav(can: (...p: string[]) => boolean, hasRole: (...r: string[]) => boolean = () => false) {
  return NAV.filter((n) => (!n.perm && !n.roles) || (n.perm && can(...n.perm)) || (n.roles && hasRole(...n.roles)));
}

export function isActive(item: NavItem, pathname: string) {
  const base = item.match || item.href;
  return pathname === base || (!item.exact && pathname.startsWith(`${base}/`));
}

/** Mobile bottom tabs: first four visible items plus Menu (ui.md). */
export function bottomTabs(items: NavItem[]) {
  return items.slice(0, 4);
}

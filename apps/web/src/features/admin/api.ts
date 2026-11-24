// Admin (users/roles/school/audit) data layer — types come from the generated OpenAPI contract.
import type { Schemas } from '@nossef/api-contracts';

export type User = Schemas['User'];
export type Role = Schemas['Role'];
export type PermissionRow = Schemas['Permission'];
export type SchoolProfile = Schemas['SchoolProfile'];
export type AuditLog = Schemas['AuditLog'];

export const ROLE_CODES = [
  'SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'CURRICULUM_ADMIN', 'FINANCE_ADMIN', 'ADMISSION_OFFICER', 'TEACHER',
  'HOMEROOM_TEACHER', 'COUNSELOR', 'LIBRARIAN', 'ASSET_OFFICER', 'STAFF', 'STUDENT', 'GUARDIAN',
] as const;
export const PRIVILEGED_ROLES = new Set(['SUPER_ADMIN', 'SCHOOL_ADMIN']);
export const ACCOUNT_STATUSES = ['CREATED', 'INVITED', 'ACTIVE', 'SUSPENDED', 'DISABLED'] as const;

export const AUDIT_EVENTS = [
  'LOGIN_SUCCESS', 'LOGIN_FAILURE', 'LOGOUT', 'PASSWORD_RESET', 'PASSWORD_CHANGED', 'USER_CREATED', 'USER_UPDATED',
  'USER_ACTIVATED', 'USER_SUSPENDED', 'USER_DISABLED', 'ROLE_ASSIGNED', 'ROLE_REMOVED', 'PERMISSION_CHANGED',
  'SYSTEM_SETTING_CHANGED',
] as const;

export const adminKeys = {
  users: (q: Record<string, unknown>) => ['admin', 'users', q] as const,
  user: (id: string) => ['admin', 'user', id] as const,
  roles: ['admin', 'roles'] as const,
  catalog: ['admin', 'permission-catalog'] as const,
  school: ['school', 'profile'] as const,
  audit: (q: Record<string, unknown>) => ['admin', 'audit', q] as const,
};

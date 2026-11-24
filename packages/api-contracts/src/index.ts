// Typed contract for the Django REST API (generated — do not edit schema.d.ts by hand).
import type { components, paths } from './schema';

export type { components, paths };
export type Schemas = components['schemas'];

/** Success envelope (PRD §46.2). */
export interface Envelope<T> {
  data: T;
  meta: { request_id: string | null } & Record<string, unknown>;
}

/** Page-number list meta (master data) or cursor meta (feeds). */
export interface PageMeta {
  request_id: string | null;
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
}
export interface CursorMeta {
  request_id: string | null;
  next_cursor: string | null;
  previous_cursor: string | null;
}

/** Error envelope (PRD §46.3). */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    fields: Record<string, string[]>;
    request_id: string | null;
    details: Record<string, unknown>;
  };
}

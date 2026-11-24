// Single typed API layer (PRD §35.2). Same-origin session cookie + CSRF header (ADR-004).
import type { ApiErrorBody, CursorMeta, PageMeta } from '@nossef/api-contracts';

export const API_BASE = '/api/v1';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields: Record<string, string[]> = {},
    public requestId: string | null = null,
    public details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

type Query = Record<string, string | number | boolean | null | undefined>;
interface Options {
  body?: unknown;
  query?: Query;
  idempotencyKey?: string;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

let csrfPromise: Promise<string> | null = null;
async function csrfToken(): Promise<string> {
  const existing = readCookie('csrftoken');
  if (existing) return existing;
  csrfPromise ??= fetch(`${API_BASE}/auth/csrf/`, { credentials: 'same-origin' })
    .then((r) => r.json())
    .then((b) => b.data.csrf_token as string)
    .finally(() => {
      csrfPromise = null;
    });
  return csrfPromise;
}

function buildUrl(path: string, query?: Query) {
  const url = `${API_BASE}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

async function raw<T, M = Record<string, unknown>>(method: string, path: string, opts: Options = {}): Promise<{ data: T; meta: M }> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const isForm = typeof FormData !== 'undefined' && opts.body instanceof FormData;
  if (opts.body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
  if (UNSAFE.has(method)) headers['X-CSRFToken'] = await csrfToken();
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;
  Object.assign(headers, opts.headers);

  let response: Response;
  try {
    response = await fetch(buildUrl(path, opts.query), {
      method,
      headers,
      credentials: 'same-origin',
      body: opts.body === undefined ? undefined : isForm ? (opts.body as FormData) : JSON.stringify(opts.body),
      signal: opts.signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(0, 'NETWORK_ERROR', 'Network unavailable');
  }

  if (response.status === 204) return { data: null as T, meta: {} as M };
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    /* non-JSON (proxy error page) */
  }
  if (!response.ok) {
    const err = (body as ApiErrorBody | null)?.error;
    const apiError = new ApiError(
      response.status,
      err?.code ?? (response.status >= 500 ? 'INTERNAL_ERROR' : 'UNKNOWN_ERROR'),
      err?.message ?? response.statusText,
      err?.fields ?? {},
      err?.request_id ?? null,
      err?.details ?? {},
    );
    if (response.status === 401 && typeof window !== 'undefined') window.dispatchEvent(new Event('nossef:unauthenticated'));
    throw apiError;
  }
  const envelope = body as { data: T; meta?: M };
  return { data: envelope.data, meta: envelope.meta ?? ({} as M) };
}

export const api = {
  get: <T>(path: string, query?: Query, signal?: AbortSignal) => raw<T>('GET', path, { query, signal }).then((r) => r.data),
  page: <T>(path: string, query?: Query, signal?: AbortSignal) => raw<T[], PageMeta>('GET', path, { query, signal }),
  feed: <T>(path: string, query?: Query, signal?: AbortSignal) => raw<T[], CursorMeta>('GET', path, { query, signal }),
  post: <T>(path: string, body?: unknown, opts: Omit<Options, 'body'> = {}) => raw<T>('POST', path, { ...opts, body }).then((r) => r.data),
  put: <T>(path: string, body?: unknown, opts: Omit<Options, 'body'> = {}) => raw<T>('PUT', path, { ...opts, body }).then((r) => r.data),
  patch: <T>(path: string, body?: unknown, opts: Omit<Options, 'body'> = {}) => raw<T>('PATCH', path, { ...opts, body }).then((r) => r.data),
  getWith: <T>(path: string, opts: Omit<Options, 'body'>) => raw<T>('GET', path, opts).then((r) => r.data),
  /** Upload one file to the private store (PRD §31.3); returns StoredFile metadata. */
  upload: (file: File, purpose: string) => {
    const form = new FormData();
    form.append('file', file);
    form.append('purpose', purpose);
    return raw<StoredFile>('POST', '/files/upload/', { body: form }).then((r) => r.data);
  },
  delete: <T>(path: string) => raw<T>('DELETE', path).then((r) => r.data),
};

export interface StoredFile { id: string; original_name: string; mime_type: string; size_bytes: number; purpose: string; created_at: string }

/** Authorized download URL (streamed through the API; never a public bucket URL). */
export function fileUrl(id: string, inline = false) {
  return `${API_BASE}/files/${id}/download/${inline ? '?inline=1' : ''}`;
}

/** Fresh key for retryable commands (PRD §46.7). */
export function idempotencyKey() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

/** First message for a form field from a VALIDATION_ERROR response. */
export function fieldError(error: unknown, field: string): string | undefined {
  return error instanceof ApiError ? error.fields[field]?.[0] : undefined;
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public extra: Record<string, any> = {}) {
    super(message);
  }
}

export const tokenStore = {
  get: () => { try { return localStorage.getItem('nossef.token'); } catch { return null; } },
  set: (t: string | null) => { try { if (t) localStorage.setItem('nossef.token', t); else localStorage.removeItem('nossef.token'); } catch { /* storage unavailable */ } },
};

export async function api<T = any>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    const token = tokenStore.get();
    res = await fetch(url, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK_OFFLINE', 'Tidak dapat terhubung ke server.');
  }
  const json = await res.json().catch(() => ({ ok: false, error: { code: 'BAD_RESPONSE', message: 'Respons server tidak valid.' } }));
  if (!res.ok || !json.ok) {
    const { code, message, ...extra } = json.error || {};
    throw new ApiError(res.status, code || 'ERROR', message || 'Terjadi kesalahan.', extra);
  }
  return json.data as T;
}

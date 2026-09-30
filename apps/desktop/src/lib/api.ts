export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001/api/v1';

export interface ApiError extends Error {
  status: number;
  code?: string;
  correlationId?: string;
  details?: unknown;
}

export async function apiFetch<T = unknown>(
  path: string,
  init: RequestInit & { json?: unknown; publicEndpoint?: boolean; spaceId?: string } = {},
): Promise<T> {
  const url = path.startsWith('http') ? path : `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
  const headers = new Headers(init.headers ?? {});
  if (init.json !== undefined) headers.set('content-type', 'application/json');
  if (!init.publicEndpoint) {
    const token = localStorage.getItem('scf.access_token');
    if (token) headers.set('authorization', `Bearer ${token}`);
  }
  if (init.spaceId) headers.set('x-financial-space-id', init.spaceId);
  headers.set('accept', 'application/json');

  const res = await fetch(url, {
    ...init,
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
    headers,
  });
  const text = await res.text().catch(() => '');
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { message: text }; }

  if (!res.ok) {
    const err = new Error(data?.message ?? data?.title ?? `Erro HTTP ${res.status}`) as ApiError;
    err.status = res.status;
    err.code = data?.code;
    err.correlationId = data?.correlationId;
    err.details = data;
    if (res.status === 401) {
      localStorage.removeItem('scf.access_token');
      localStorage.removeItem('scf.refresh_token');
      localStorage.removeItem('scf.currentSpaceId');
    }
    throw err;
  }
  return data as T;
}

import 'nativewind';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { cacheKeyFor, isMutationMethod, type HttpMethod, type PendingRequest } from '@scf/offline';
import {
  isNetworkError,
  offlineCache,
  offlineQueue,
  setOfflineTransport,
  setOnline,
} from './offline';

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  (Platform.OS === 'android' ? 'http://10.0.2.2:3001/api/v1' : 'http://localhost:3001/api/v1');

const ACCESS_KEY = 'scf.access_token';
const REFRESH_KEY = 'scf.refresh_token';
const SPACE_KEY = 'scf.current_space_id';

export async function getToken() {
  try { return await SecureStore.getItemAsync(ACCESS_KEY); } catch { return null; }
}
export async function getRefreshToken() {
  try { return await SecureStore.getItemAsync(REFRESH_KEY); } catch { return null; }
}
export async function setTokens(access: string, refresh: string) {
  await SecureStore.setItemAsync(ACCESS_KEY, access);
  await SecureStore.setItemAsync(REFRESH_KEY, refresh);
}
export async function clearTokens() {
  await SecureStore.deleteItemAsync(ACCESS_KEY).catch(() => {});
  await SecureStore.deleteItemAsync(REFRESH_KEY).catch(() => {});
  await SecureStore.deleteItemAsync(SPACE_KEY).catch(() => {});
}
export async function getCurrentSpaceId() {
  try { return await SecureStore.getItemAsync(SPACE_KEY); } catch { return null; }
}
export async function setCurrentSpaceId(id: string) {
  await SecureStore.setItemAsync(SPACE_KEY, id);
}

interface ApiInit extends RequestInit {
  json?: unknown;
  publicEndpoint?: boolean;
  spaceId?: string;
}

/**
 * Envio HTTP cru. Separado de `apiFetch` para poder ser reutilizado pela fila
 * de escritas offline sem cair na logica de cache/fila.
 */
async function performRequest<T>(method: HttpMethod, path: string, init: ApiInit = {}): Promise<T> {
  const url = path.startsWith('http') ? path : `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
  const headers = new Headers(init.headers ?? {});
  if (init.json !== undefined) headers.set('content-type', 'application/json');
  if (!init.publicEndpoint) {
    const token = await getToken();
    if (token) headers.set('authorization', `Bearer ${token}`);
  }
  if (init.spaceId) headers.set('x-financial-space-id', init.spaceId);
  headers.set('accept', 'application/json');

  const res = await fetch(url, {
    ...init,
    method,
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
    headers,
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { message: text }; }

  if (!res.ok) {
    const err = new Error(data?.message ?? data?.title ?? `Erro HTTP ${res.status}`) as any;
    err.status = res.status;
    err.code = data?.code;
    err.details = data;
    if (res.status === 401) await clearTokens();
    throw err;
  }
  return data;
}

// A fila usa o mesmo envio cru (com token do SecureStore) para reexecutar as
// mutacoes guardadas offline, reenviando a mesma chave de idempotencia.
setOfflineTransport({
  send: (mutation) =>
    performRequest(mutation.method, mutation.path, {
      json: mutation.body,
      spaceId: mutation.spaceId,
      headers: { 'idempotency-key': mutation.idempotencyKey },
    }),
});

export async function apiFetch<T = unknown>(path: string, init: ApiInit = {}): Promise<T> {
  const method = String(init.method ?? 'GET').toUpperCase() as HttpMethod;
  const cacheKey = cacheKeyFor({ path, spaceId: init.spaceId, method });

  // Leitura: cache write-through com fallback para o ultimo valor visto.
  if (!isMutationMethod(method)) {
    try {
      const data = await performRequest<T>(method, path, init);
      setOnline(true);
      await offlineCache.write(cacheKey, data);
      void offlineQueue.flush();
      return data;
    } catch (error) {
      if (isNetworkError(error)) {
        setOnline(false);
        const cached = await offlineCache.read<T>(cacheKey, { allowStale: true });
        if (cached !== null) return cached;
      }
      throw error;
    }
  }

  // Escrita: se a rede cair, guarda na fila e reenvia ao reconectar.
  try {
    const data = await performRequest<T>(method, path, init);
    setOnline(true);
    return data;
  } catch (error) {
    if (isNetworkError(error) && !init.publicEndpoint) {
      setOnline(false);
      const request: PendingRequest = { method, path, body: init.json ?? init.body, spaceId: init.spaceId };
      await offlineQueue.enqueue(request);
      return undefined as T;
    }
    throw error;
  }
}

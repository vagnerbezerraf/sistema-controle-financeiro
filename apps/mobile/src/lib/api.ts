import 'nativewind';
import { Platform } from 'react-native';

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  (Platform.OS === 'android' ? 'http://10.0.2.2:3001/api/v1' : 'http://localhost:3001/api/v1');

export async function apiFetch<T = unknown>(
  path: string,
  init: RequestInit & { json?: unknown; publicEndpoint?: boolean; spaceId?: string } = {},
): Promise<T> {
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

import * as SecureStore from 'expo-secure-store';

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

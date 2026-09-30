import React, { createContext, useContext, useEffect, useState } from 'react';
import type { AuthResponse, FinancialSpace, FinancialSpaceRole, UserProfile } from '@scf/api-contracts';
import { apiFetch, clearTokens, getCurrentSpaceId, getRefreshToken, getToken, setCurrentSpaceId, setTokens } from '../lib/api';

interface AuthState {
  user: UserProfile | null;
  spaces: FinancialSpace[];
  currentSpaceId: string | null;
  loading: boolean;
  loggedIn: boolean;
  roleInCurrentSpace: FinancialSpaceRole | null;
  login: (email: string, password: string) => Promise<AuthResponse>;
  register: (input: { email: string; password?: string; name?: string; timezone?: string }) => Promise<AuthResponse>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  setCurrentSpace: (id: string) => Promise<void>;
}

const Ctx = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [spaces, setSpaces] = useState<FinancialSpace[]>([]);
  const [currentSpaceId, setCurrentSpaceIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { init(); }, []);

  async function init() {
    try {
      const token = await getToken();
      if (!token) { setLoading(false); return; }
      await bootstrap();
    } finally {
      setLoading(false);
    }
  }

  async function bootstrap() {
    try {
      const me = await apiFetch<UserProfile>('/identity/me');
      setUser(me);
      const sp = await apiFetch<FinancialSpace[]>('/financial-spaces');
      setSpaces(sp);
      const saved = await getCurrentSpaceId();
      const id = saved ?? (sp[0]?.id ?? null);
      if (id) {
        setCurrentSpaceIdState(id);
        await setCurrentSpaceId(id);
      }
    } catch (e: any) {
      if (e?.status === 401) {
        const refresh = await getRefreshToken();
        if (refresh) {
          try {
            const tokens = await apiFetch<AuthResponse>('/identity/refresh', {
              method: 'POST', json: { refreshToken: refresh }, publicEndpoint: true,
            });
            await setTokens(tokens.accessToken, tokens.refreshToken);
            return bootstrap();
          } catch {}
        }
      }
      await clearTokens();
      setUser(null);
    }
  }

  async function login(email: string, password: string) {
    const res = await apiFetch<AuthResponse>('/identity/login', {
      method: 'POST', json: { email, password }, publicEndpoint: true,
    });
    await setTokens(res.accessToken, res.refreshToken);
    await bootstrap();
    return res;
  }

  async function register(input: { email: string; password?: string; name?: string; timezone?: string }) {
    const res = await apiFetch<AuthResponse>('/identity/register', {
      method: 'POST', json: input, publicEndpoint: true,
    });
    await setTokens(res.accessToken, res.refreshToken);
    await bootstrap();
    return res;
  }

  async function logout() {
    await clearTokens();
    setUser(null);
    setSpaces([]);
    setCurrentSpaceIdState(null);
  }

  async function refresh() {
    const r = await getRefreshToken();
    if (!r) throw new Error('Sem refresh token');
    const tokens = await apiFetch<AuthResponse>('/identity/refresh', {
      method: 'POST', json: { refreshToken: r }, publicEndpoint: true,
    });
    await setTokens(tokens.accessToken, tokens.refreshToken);
    await bootstrap();
  }

  async function setCurrentSpace(id: string) {
    setCurrentSpaceIdState(id);
    await setCurrentSpaceId(id);
  }

  const memberships = (user as any)?.memberships as Array<{ spaceId: string; role: FinancialSpaceRole }> | undefined;
  const roleInCurrentSpace = currentSpaceId ? memberships?.find(m => m.spaceId === currentSpaceId)?.role ?? null : null;

  return (
    <Ctx.Provider value={{
      user, spaces, currentSpaceId, loading, loggedIn: !!user,
      roleInCurrentSpace, login, register, logout, refresh, setCurrentSpace,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth fora do AuthProvider');
  return ctx;
}

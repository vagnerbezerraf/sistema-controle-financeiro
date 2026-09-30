import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { AuthResponse, FinancialSpace, FinancialSpaceRole, UserProfile } from '@scf/api-contracts';
import { apiFetch } from '../lib/api';

interface AuthState {
  user: UserProfile | null;
  spaces: FinancialSpace[];
  currentSpaceId: string | null;
  loading: boolean;
  loggedIn: boolean;
  roleInCurrentSpace: FinancialSpaceRole | null;
  login: (email: string, password: string) => Promise<AuthResponse>;
  register: (input: { email: string; password?: string; name?: string; timezone?: string }) => Promise<AuthResponse>;
  logout: () => void;
  refresh: () => Promise<void>;
  setCurrentSpace: (id: string) => void;
}

const Ctx = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const _location = useLocation();
  void _location;
  const [user, setUser] = useState<UserProfile | null>(null);
  const [spaces, setSpaces] = useState<FinancialSpace[]>([]);
  const [currentSpaceId, setCurrentSpaceIdState] = useState<string | null>(() => localStorage.getItem('scf.currentSpaceId'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = localStorage.getItem('scf.access_token');
    if (!t) { setLoading(false); return; }
    bootstrap().finally(() => setLoading(false));
  }, []);

  async function bootstrap() {
    try {
      const me = await apiFetch<UserProfile>('/identity/me');
      setUser(me);
      const sp = await apiFetch<FinancialSpace[]>('/financial-spaces');
      setSpaces(sp);
      if (sp.length && !currentSpaceId) {
        setCurrentSpaceIdState(sp[0].id);
        localStorage.setItem('scf.currentSpaceId', sp[0].id);
      }
    } catch (e: any) {
      if (e?.status === 401) {
        const refresh = localStorage.getItem('scf.refresh_token');
        if (refresh) {
          try {
            const tokens = await apiFetch<AuthResponse>('/identity/refresh', {
              method: 'POST', json: { refreshToken: refresh }, publicEndpoint: true,
            });
            localStorage.setItem('scf.access_token', tokens.accessToken);
            localStorage.setItem('scf.refresh_token', tokens.refreshToken);
            return bootstrap();
          } catch {}
        }
      }
      localStorage.removeItem('scf.access_token');
      localStorage.removeItem('scf.refresh_token');
      setUser(null);
    }
  }

  async function login(email: string, password: string) {
    const res = await apiFetch<AuthResponse>('/identity/login', {
      method: 'POST', json: { email, password }, publicEndpoint: true,
    });
    localStorage.setItem('scf.access_token', res.accessToken);
    localStorage.setItem('scf.refresh_token', res.refreshToken);
    await bootstrap();
    navigate('/dashboard');
    return res;
  }

  async function register(input: { email: string; password?: string; name?: string; timezone?: string }) {
    const res = await apiFetch<AuthResponse>('/identity/register', {
      method: 'POST', json: input, publicEndpoint: true,
    });
    localStorage.setItem('scf.access_token', res.accessToken);
    localStorage.setItem('scf.refresh_token', res.refreshToken);
    await bootstrap();
    navigate('/dashboard');
    return res;
  }

  function logout() {
    localStorage.removeItem('scf.access_token');
    localStorage.removeItem('scf.refresh_token');
    localStorage.removeItem('scf.currentSpaceId');
    setUser(null);
    setSpaces([]);
    setCurrentSpaceIdState(null);
    navigate('/login', { replace: true });
  }

  async function refresh() {
    const r = localStorage.getItem('scf.refresh_token');
    if (!r) throw new Error('Sem refresh token');
    const tokens = await apiFetch<AuthResponse>('/identity/refresh', { method: 'POST', json: { refreshToken: r }, publicEndpoint: true });
    localStorage.setItem('scf.access_token', tokens.accessToken);
    localStorage.setItem('scf.refresh_token', tokens.refreshToken);
    await bootstrap();
  }

  function setCurrentSpace(id: string) {
    setCurrentSpaceIdState(id);
    localStorage.setItem('scf.currentSpaceId', id);
  }

  const roleInCurrentSpace = useMemo(() => {
    if (!currentSpaceId) return null;
    const memberships = (user as any)?.memberships as Array<{ spaceId: string; role: FinancialSpaceRole }> | undefined;
    return memberships?.find((m) => m.spaceId === currentSpaceId)?.role ?? null;
  }, [currentSpaceId, user]);

  const value: AuthState = {
    user, spaces, currentSpaceId, loading, loggedIn: !!user,
    roleInCurrentSpace, login, register, logout, refresh, setCurrentSpace,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth fora do AuthProvider');
  return ctx;
}

'use client';
import React, { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { apiFetch, setAuth, clearAuth, getAuthToken, getRefreshToken } from '@/lib/api-client';
import type { UserProfile, AuthResponse, FinancialSpace, FinancialSpaceRole } from '@scf/api-contracts';

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

const AuthContext = createContext<AuthState | undefined>(undefined);

const PUBLIC_PATHS = ['/login', '/register', '/', '/docs', '/health'];

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [spaces, setSpaces] = useState<FinancialSpace[]>([]);
  const [currentSpaceId, setCurrentSpaceIdState] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem('scf.currentSpaceId');
  });
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      setLoading(false);
      return;
    }
    bootstrap().finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const onUnauthorized = () => {
      clearAuth();
      setUser(null);
      setSpaces([]);
      const isPublic = PUBLIC_PATHS.some((p) => pathname?.startsWith(p));
      if (!isPublic) router.replace('/login');
    };
    window.addEventListener('scf:unauthorized', onUnauthorized);
    return () => window.removeEventListener('scf:unauthorized', onUnauthorized);
  }, [pathname, router]);

  async function bootstrap() {
    try {
      const me = await apiFetch<UserProfile>('/identity/me');
      setUser(me);
      const sp = await apiFetch<FinancialSpace[]>('/financial-spaces');
      setSpaces(sp);
      if (sp.length && !currentSpaceId) {
        setCurrentSpaceIdState(sp[0].id);
        window.localStorage.setItem('scf.currentSpaceId', sp[0].id);
      }
    } catch (e: any) {
      if (e?.status === 401) {
        try {
          const refresh = getRefreshToken();
          if (refresh) {
            const tokens = await apiFetch<AuthResponse>('/identity/refresh', {
              method: 'POST',
              json: { refreshToken: refresh },
              publicEndpoint: true,
            });
            setAuth(tokens.accessToken, tokens.refreshToken);
            return bootstrap();
          }
        } catch {}
      }
      clearAuth();
      setUser(null);
    }
  }

  async function login(email: string, password: string) {
    const res = await apiFetch<AuthResponse>('/identity/login', {
      method: 'POST',
      json: { email, password },
      publicEndpoint: true,
    });
    setAuth(res.accessToken, res.refreshToken);
    await bootstrap();
    router.push('/app/dashboard');
    return res;
  }

  async function register(input: { email: string; password?: string; name?: string; timezone?: string }) {
    const res = await apiFetch<AuthResponse>('/identity/register', {
      method: 'POST',
      json: input,
      publicEndpoint: true,
    });
    setAuth(res.accessToken, res.refreshToken);
    await bootstrap();
    router.push('/app/dashboard');
    return res;
  }

  function logout() {
    clearAuth();
    setUser(null);
    setSpaces([]);
    setCurrentSpaceIdState(null);
    router.push('/login');
  }

  async function refresh() {
    const refreshToken = getRefreshToken();
    if (!refreshToken) throw new Error('Sem refresh token');
    const res = await apiFetch<AuthResponse>('/identity/refresh', {
      method: 'POST',
      json: { refreshToken },
      publicEndpoint: true,
    });
    setAuth(res.accessToken, res.refreshToken);
    await bootstrap();
  }

  function setCurrentSpace(id: string) {
    setCurrentSpaceIdState(id);
    window.localStorage.setItem('scf.currentSpaceId', id);
  }

  const roleInCurrentSpace = useMemo(() => {
    if (!currentSpaceId) return null;
    const memberships = (user as any)?.memberships as Array<{ spaceId: string; role: FinancialSpaceRole }> | undefined;
    return memberships?.find((m) => m.spaceId === currentSpaceId)?.role ?? null;
  }, [currentSpaceId, user]);

  const value: AuthState = {
    user,
    spaces,
    currentSpaceId,
    loading,
    loggedIn: !!user,
    roleInCurrentSpace,
    login,
    register,
    logout,
    refresh,
    setCurrentSpace,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth fora do AuthProvider');
  return ctx;
}

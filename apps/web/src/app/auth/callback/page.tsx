'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { clearPkceSession, readPkceSession } from '@/lib/oidc';
import { useAuth } from '@/components/auth/AuthContext';
import type { AuthResponse } from '@scf/api-contracts';

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <main id="conteudo" className="mx-auto flex min-h-[calc(100vh-120px)] max-w-6xl items-center justify-center px-4 py-10">
          <div className="card w-full max-w-md p-8 text-center text-sm text-neutral-500">Carregando...</div>
        </main>
      }
    >
      <AuthCallbackHandler />
    </Suspense>
  );
}

function AuthCallbackHandler() {
  const search = useSearchParams();
  const { applySession } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const errorParam = search.get('error');
    if (errorParam) {
      clearPkceSession();
      setError(`Login SSO recusado (${errorParam}).`);
      return;
    }

    const code = search.get('code');
    const state = search.get('state');
    const { verifier, state: savedState, client } = readPkceSession();

    if (!code || !verifier || !savedState || state !== savedState) {
      clearPkceSession();
      setError('Sessao de login invalida ou expirada. Tente novamente.');
      return;
    }

    (async () => {
      try {
        const res = await apiFetch<AuthResponse>('/identity/oidc/exchange', {
          method: 'POST',
          json: { client, code, codeVerifier: verifier },
          publicEndpoint: true,
        });
        clearPkceSession();
        await applySession(res);
      } catch (e: any) {
        setError(e?.details?.message ?? e?.message ?? 'Falha ao concluir o login SSO');
      }
    })();
  }, [applySession, search]);

  return (
    <main id="conteudo" className="mx-auto flex min-h-[calc(100vh-120px)] max-w-6xl items-center justify-center px-4 py-10">
      <div className="card w-full max-w-md p-8 text-center">
        <h1 className="card-title">Concluindo login</h1>
        {error ? (
          <>
            <p className="mt-3 text-sm text-danger-700">{error}</p>
            <Link href="/login" className="btn-primary mt-6 inline-block">Voltar para o login</Link>
          </>
        ) : (
          <p className="mt-3 text-sm text-neutral-500">Validando suas credenciais no provedor de identidade...</p>
        )}
      </div>
    </main>
  );
}

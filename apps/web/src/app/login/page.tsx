'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '@/components/auth/AuthContext';
import { Suspense, useEffect, useState } from 'react';
import { fetchOidcConfig, startOidcLogin } from '@/lib/oidc';

const schema = z.object({
  email: z.string().email('Informe um e-mail valido'),
  password: z.string().min(8, 'Senha deve ter pelo menos 8 caracteres'),
  mfaCode: z.string().optional(),
});

type Inputs = z.infer<typeof schema>;

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main id="conteudo" className="mx-auto flex min-h-[calc(100vh-120px)] max-w-6xl items-center justify-center px-4 py-10">
          <div className="card w-full max-w-md p-8 text-center text-sm text-neutral-500">Carregando...</div>
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const { login } = useAuth();
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get('next') ?? '/app/dashboard';
  const [error, setError] = useState<string | null>(null);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [ssoEnabled, setSsoEnabled] = useState(false);
  const [ssoLoading, setSsoLoading] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<Inputs>({ resolver: zodResolver(schema), defaultValues: { mfaCode: '' } });

  const email = watch('email');

  useEffect(() => {
    fetchOidcConfig('web')
      .then((cfg) => setSsoEnabled(cfg.enabled))
      .catch(() => setSsoEnabled(false));
  }, []);

  async function submit(data: Inputs) {
    setError(null);
    try {
      const res = await login(data.email, data.password, data.mfaCode || undefined);
      if (res.mfaRequired) {
        setMfaRequired(true);
        return;
      }
      router.replace(next);
    } catch (e: any) {
      setError(e?.details?.message ?? e?.message ?? 'Credenciais invalidas');
    }
  }

  async function onSso() {
    setError(null);
    setSsoLoading(true);
    try {
      await startOidcLogin('web');
    } catch (e: any) {
      setSsoLoading(false);
      setError(e?.message ?? 'Nao foi possivel iniciar o login SSO');
    }
  }

  return (
    <main id="conteudo" className="mx-auto flex min-h-[calc(100vh-120px)] max-w-6xl items-center justify-center px-4 py-10">
      <div className="card w-full max-w-md p-8">
        <div className="mb-6">
          <h1 className="card-title">Entrar</h1>
          <p className="card-subtitle mt-1">Acesse sua conta no SCF</p>
        </div>
        <form onSubmit={handleSubmit(submit)} className="space-y-4">
          <div>
            <label htmlFor="email" className="label block">E-mail</label>
            <input id="email" type="email" className="input mt-1" autoComplete="email" {...register('email')} />
            {errors.email && <p className="mt-1 text-xs text-danger-600">{errors.email.message}</p>}
          </div>
          <div>
            <label htmlFor="password" className="label block">Senha</label>
            <input id="password" type="password" className="input mt-1" autoComplete="current-password" {...register('password')} />
            {errors.password && <p className="mt-1 text-xs text-danger-600">{errors.password.message}</p>}
          </div>
          {mfaRequired && (
            <div>
              <label htmlFor="mfaCode" className="label block">Codigo de verificacao (MFA)</label>
              <input
                id="mfaCode"
                className="input mt-1"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456 ou codigo de recuperacao"
                {...register('mfaCode')}
              />
              <p className="mt-1 text-xs text-neutral-500">
                Abra seu app autenticador ou use um codigo de recuperacao.
              </p>
            </div>
          )}
          {error && (
            <div className="rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700">
              {error}
            </div>
          )}
          <button type="submit" className="btn-primary w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Entrando...' : mfaRequired ? 'Confirmar codigo' : 'Entrar'}
          </button>
        </form>

        <div className="mt-4 text-center text-sm">
          <Link className="text-brand-700 hover:underline" href={`/forgot-password${email ? `?email=${encodeURIComponent(email)}` : ''}`}>
            Esqueci minha senha
          </Link>
        </div>

        {ssoEnabled && (
          <>
            <div className="my-6 flex items-center gap-3 text-xs text-neutral-400">
              <span className="h-px flex-1 bg-neutral-200" /> ou <span className="h-px flex-1 bg-neutral-200" />
            </div>
            <button type="button" onClick={onSso} className="btn-outline w-full" disabled={ssoLoading}>
              {ssoLoading ? 'Redirecionando...' : 'Entrar com SSO (OIDC)'}
            </button>
          </>
        )}

        <p className="mt-6 text-center text-sm text-neutral-600">
          Ainda nao tem conta? <Link className="text-brand-700 hover:underline" href="/register">Criar conta</Link>
        </p>
      </div>
    </main>
  );
}

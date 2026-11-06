'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Suspense, useState } from 'react';
import { apiFetch } from '@/lib/api-client';

const schema = z.object({
  email: z.string().email('Informe um e-mail valido'),
});

type Inputs = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  return (
    <Suspense
      fallback={
        <main id="conteudo" className="mx-auto flex min-h-[calc(100vh-120px)] max-w-6xl items-center justify-center px-4 py-10">
          <div className="card w-full max-w-md p-8 text-center text-sm text-neutral-500">Carregando...</div>
        </main>
      }
    >
      <ForgotPasswordForm />
    </Suspense>
  );
}

function ForgotPasswordForm() {
  const search = useSearchParams();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Inputs>({
    resolver: zodResolver(schema),
    defaultValues: { email: search.get('email') ?? '' },
  });

  async function submit(data: Inputs) {
    setError(null);
    try {
      await apiFetch('/identity/password/forgot', {
        method: 'POST',
        json: { email: data.email },
        publicEndpoint: true,
      });
      setSent(true);
    } catch (e: any) {
      setError(e?.details?.message ?? e?.message ?? 'Nao foi possivel solicitar a redefinicao');
    }
  }

  return (
    <main id="conteudo" className="mx-auto flex min-h-[calc(100vh-120px)] max-w-6xl items-center justify-center px-4 py-10">
      <div className="card w-full max-w-md p-8">
        <div className="mb-6">
          <h1 className="card-title">Recuperar senha</h1>
          <p className="card-subtitle mt-1">
            Informe seu e-mail e enviaremos um link para redefinir sua senha.
          </p>
        </div>

        {sent ? (
          <div className="space-y-4">
            <div className="rounded-md border border-success-200 bg-success-50 px-3 py-2 text-sm text-success-700">
              Se houver uma conta com esse e-mail, enviamos as instrucoes de redefinicao.
            </div>
            <p className="text-sm text-neutral-600">
              Verifique sua caixa de entrada e a pasta de spam. O link expira em 60 minutos.
            </p>
            <Link href="/login" className="btn-outline block text-center">Voltar para o login</Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit(submit)} className="space-y-4">
            <div>
              <label htmlFor="email" className="label block">E-mail</label>
              <input id="email" type="email" className="input mt-1" autoComplete="email" {...register('email')} />
              {errors.email && <p className="mt-1 text-xs text-danger-600">{errors.email.message}</p>}
            </div>
            {error && (
              <div className="rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700">
                {error}
              </div>
            )}
            <button type="submit" className="btn-primary w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Enviando...' : 'Enviar link de redefinicao'}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-neutral-600">
          Lembrou a senha? <Link className="text-brand-700 hover:underline" href="/login">Entrar</Link>
        </p>
      </div>
    </main>
  );
}

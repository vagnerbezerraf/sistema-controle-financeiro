'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Suspense, useState } from 'react';
import { apiFetch } from '@/lib/api-client';

const schema = z
  .object({
    password: z.string().min(8, 'Senha deve ter pelo menos 8 caracteres'),
    password2: z.string().min(8, 'Confirme a senha'),
  })
  .refine((d) => d.password === d.password2, {
    message: 'Senhas nao coincidem',
    path: ['password2'],
  });

type Inputs = z.infer<typeof schema>;

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <main id="conteudo" className="mx-auto flex min-h-[calc(100vh-120px)] max-w-6xl items-center justify-center px-4 py-10">
          <div className="card w-full max-w-md p-8 text-center text-sm text-neutral-500">Carregando...</div>
        </main>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const router = useRouter();
  const search = useSearchParams();
  const token = search.get('token') ?? '';
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Inputs>({ resolver: zodResolver(schema) });

  async function submit(data: Inputs) {
    setError(null);
    try {
      await apiFetch('/identity/password/reset', {
        method: 'POST',
        json: { token, password: data.password },
        publicEndpoint: true,
      });
      setDone(true);
      setTimeout(() => router.replace('/login'), 2500);
    } catch (e: any) {
      setError(e?.details?.message ?? e?.message ?? 'Nao foi possivel redefinir a senha');
    }
  }

  if (!token) {
    return (
      <main id="conteudo" className="mx-auto flex min-h-[calc(100vh-120px)] max-w-6xl items-center justify-center px-4 py-10">
        <div className="card w-full max-w-md p-8 text-center">
          <h1 className="card-title">Link invalido</h1>
          <p className="card-subtitle mt-2">
            Este link de redefinicao esta incompleto ou expirou. Solicite um novo.
          </p>
          <Link href="/forgot-password" className="btn-primary mt-6 block">Solicitar novo link</Link>
        </div>
      </main>
    );
  }

  return (
    <main id="conteudo" className="mx-auto flex min-h-[calc(100vh-120px)] max-w-6xl items-center justify-center px-4 py-10">
      <div className="card w-full max-w-md p-8">
        <div className="mb-6">
          <h1 className="card-title">Definir nova senha</h1>
          <p className="card-subtitle mt-1">Escolha uma senha forte para sua conta.</p>
        </div>

        {done ? (
          <div className="space-y-4">
            <div className="rounded-md border border-success-200 bg-success-50 px-3 py-2 text-sm text-success-700">
              Senha redefinida com sucesso. Redirecionando para o login...
            </div>
            <Link href="/login" className="btn-outline block text-center">Ir para o login</Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit(submit)} className="space-y-4">
            <div>
              <label htmlFor="password" className="label block">Nova senha</label>
              <input id="password" type="password" className="input mt-1" autoComplete="new-password" {...register('password')} />
              {errors.password && <p className="mt-1 text-xs text-danger-600">{errors.password.message}</p>}
            </div>
            <div>
              <label htmlFor="password2" className="label block">Confirmar nova senha</label>
              <input id="password2" type="password" className="input mt-1" autoComplete="new-password" {...register('password2')} />
              {errors.password2 && <p className="mt-1 text-xs text-danger-600">{errors.password2.message}</p>}
            </div>
            {error && (
              <div className="rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700">
                {error}
              </div>
            )}
            <button type="submit" className="btn-primary w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Salvando...' : 'Redefinir senha'}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-neutral-600">
          <Link className="text-brand-700 hover:underline" href="/login">Voltar para o login</Link>
        </p>
      </div>
    </main>
  );
}

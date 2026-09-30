'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '@/components/auth/AuthContext';
import { useState } from 'react';

const schema = z.object({
  email: z.string().email('Informe um e-mail valido'),
  password: z.string().min(8, 'Senha deve ter pelo menos 8 caracteres'),
});

type Inputs = z.infer<typeof schema>;

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get('next') ?? '/app/dashboard';
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Inputs>({ resolver: zodResolver(schema) });

  async function submit(data: Inputs) {
    setError(null);
    try {
      await login(data.email, data.password);
      router.replace(next);
    } catch (e: any) {
      setError(e?.details?.message ?? e?.message ?? 'Credenciais invalidas');
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
          {error && (
            <div className="rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700">
              {error}
            </div>
          )}
          <button type="submit" className="btn-primary w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-neutral-600">
          Ainda nao tem conta? <Link className="text-brand-700 hover:underline" href="/register">Criar conta</Link>
        </p>
      </div>
    </main>
  );
}

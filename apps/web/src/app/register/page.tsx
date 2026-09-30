'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '@/components/auth/AuthContext';
import { useState } from 'react';

const schema = z
  .object({
    name: z.string().min(2, 'Nome muito curto').optional(),
    email: z.string().email('Informe um e-mail valido'),
    password: z.string().min(8, 'Senha deve ter pelo menos 8 caracteres'),
    password2: z.string().min(8, 'Confirme a senha'),
    timezone: z.string().default('America/Sao_Paulo'),
  })
  .refine((d) => d.password === d.password2, {
    message: 'Senhas nao coincidem',
    path: ['password2'],
  });

type Inputs = z.infer<typeof schema>;

export default function RegisterPage() {
  const { register: reg } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Inputs>({ resolver: zodResolver(schema), defaultValues: { timezone: 'America/Sao_Paulo' } });

  async function submit(data: Inputs) {
    setError(null);
    try {
      await reg({ email: data.email, password: data.password, name: data.name, timezone: data.timezone });
      router.replace('/app/dashboard');
    } catch (e: any) {
      setError(e?.details?.message ?? e?.message ?? 'Nao foi possivel criar a conta');
    }
  }

  return (
    <main id="conteudo" className="mx-auto flex min-h-[calc(100vh-120px)] max-w-6xl items-center justify-center px-4 py-10">
      <div className="card w-full max-w-md p-8">
        <div className="mb-6">
          <h1 className="card-title">Criar conta</h1>
          <p className="card-subtitle mt-1">Comece a organizar sua vida financeira</p>
        </div>
        <form onSubmit={handleSubmit(submit)} className="space-y-4">
          <div>
            <label htmlFor="name" className="label block">Nome (opcional)</label>
            <input id="name" type="text" className="input mt-1" autoComplete="name" {...register('name')} />
            {errors.name && <p className="mt-1 text-xs text-danger-600">{errors.name.message}</p>}
          </div>
          <div>
            <label htmlFor="email" className="label block">E-mail</label>
            <input id="email" type="email" className="input mt-1" autoComplete="email" {...register('email')} />
            {errors.email && <p className="mt-1 text-xs text-danger-600">{errors.email.message}</p>}
          </div>
          <div>
            <label htmlFor="password" className="label block">Senha</label>
            <input id="password" type="password" className="input mt-1" autoComplete="new-password" {...register('password')} />
            {errors.password && <p className="mt-1 text-xs text-danger-600">{errors.password.message}</p>}
          </div>
          <div>
            <label htmlFor="password2" className="label block">Confirmar senha</label>
            <input id="password2" type="password" className="input mt-1" autoComplete="new-password" {...register('password2')} />
            {errors.password2 && <p className="mt-1 text-xs text-danger-600">{errors.password2.message}</p>}
          </div>
          {error && (
            <div className="rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700">
              {error}
            </div>
          )}
          <button type="submit" className="btn-primary w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Criando...' : 'Criar conta e entrar'}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-neutral-600">
          Ja tem conta? <Link className="text-brand-700 hover:underline" href="/login">Entrar</Link>
        </p>
      </div>
    </main>
  );
}

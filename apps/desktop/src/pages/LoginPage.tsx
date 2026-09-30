import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '../auth/AuthContext';
import { ShieldCheck, Sparkles } from 'lucide-react';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

type Inputs = z.infer<typeof schema>;

export default function LoginPage() {
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Inputs>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (data) => {
    setError(null);
    try {
      if (mode === 'login') await login(data.email, data.password);
    } catch (e: any) {
      setError(e?.details?.message ?? e?.message ?? 'Credenciais invalidas');
    }
  });

  return (
    <main className="mx-auto flex h-full max-w-5xl items-center justify-center px-6 py-8">
      <div className="grid w-full gap-8 md:grid-cols-2">
        <section className="hidden md:flex flex-col justify-between rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 p-10 text-white shadow-xl">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-white/10 backdrop-blur">
              <ShieldCheck className="h-6 w-6" />
            </span>
            <div>
              <div className="text-2xl font-bold">SCF</div>
              <div className="text-sm opacity-90">Controle Financeiro</div>
            </div>
          </div>
          <div className="space-y-3">
            <h2 className="text-3xl font-semibold leading-tight">Seu financeiro, com clareza.</h2>
            <p className="text-sm leading-relaxed text-white/80">
              Versao desktop instalavel. Atalhos de teclado, selecao nativa de arquivos para importacao/exportacao
              e notificacoes do sistema.
            </p>
            <ul className="space-y-2 text-sm text-white/90">
              <li className="flex items-center gap-2"><Sparkles className="h-4 w-4" /> Separacao explicita entre realizado e projetado.</li>
              <li className="flex items-center gap-2"><Sparkles className="h-4 w-4" /> Valores decimais, sem arredondamentos surpresa.</li>
              <li className="flex items-center gap-2"><Sparkles className="h-4 w-4" /> Mesmos dados da web e do mobile.</li>
            </ul>
          </div>
          <div className="text-xs text-white/60">v0.1.0 · MVP</div>
        </section>

        <section className="card p-8">
          <div className="mb-6">
            <div className="flex items-center gap-2 rounded-md bg-neutral-100 p-1 text-sm">
              <button
                className={`flex-1 rounded px-3 py-1.5 transition-fast ${mode === 'login' ? 'bg-white shadow-sm font-medium' : 'text-neutral-600'}`}
                onClick={() => setMode('login')}
              >
                Entrar
              </button>
              <button
                className={`flex-1 rounded px-3 py-1.5 transition-fast ${mode === 'register' ? 'bg-white shadow-sm font-medium' : 'text-neutral-600'}`}
                onClick={() => setMode('register')}
              >
                Criar conta
              </button>
            </div>
            <p className="card-subtitle mt-4">
              {mode === 'login' ? 'Acesse sua conta SCF.' : 'Comece a organizar suas financas.'}
            </p>
          </div>
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="label block">E-mail</label>
              <input type="email" className="input mt-1" {...register('email')} />
              {errors.email && <p className="mt-1 text-xs text-danger-600">{errors.email.message}</p>}
            </div>
            <div>
              <label className="label block">Senha</label>
              <input type="password" className="input mt-1" {...register('password')} />
              {errors.password && <p className="mt-1 text-xs text-danger-600">{errors.password.message}</p>}
            </div>
            {error && (
              <div className="rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700">{error}</div>
            )}
            <button type="submit" className="btn-primary w-full" disabled={isSubmitting}>
              {mode === 'login' ? 'Entrar' : 'Criar conta'}
            </button>
          </form>
          <p className="mt-6 text-center text-xs text-neutral-500">
            Dica: o MVP tambem funciona com navegador Web em modo servidor de desenvolvimento.
          </p>
        </section>
      </div>
    </main>
  );
}

'use client';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/components/auth/AuthContext';
import { apiFetch } from '@/lib/api-client';
import type { Category } from '@scf/api-contracts';
import { Tags } from 'lucide-react';

export default function CategoriesPage() {
  const { currentSpaceId } = useAuth();
  const q = useQuery({
    queryKey: ['categories', currentSpaceId],
    enabled: !!currentSpaceId,
    queryFn: () => apiFetch<Category[]>(`/financial-spaces/${currentSpaceId}/categories`),
  });
  const list = q.data ?? [];

  const income = list.filter((c) => c.type === 'income' || c.type === 'both');
  const expense = list.filter((c) => c.type === 'expense' || c.type === 'both');

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Categorias</h1>
        <p className="text-sm text-neutral-500">
          Classifique seus lancamentos em receitas, despesas e ambos.
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        <CategorySection title="Receitas" subtitle="Fontes de renda e entradas" list={income} tone="success" />
        <CategorySection title="Despesas" subtitle="Gastos e saidas" list={expense} tone="danger" />
      </div>
    </div>
  );
}

function CategorySection({ title, subtitle, list, tone }: { title: string; subtitle: string; list: Category[]; tone: 'success' | 'danger' }) {
  return (
    <section className="card">
      <div className="card-header">
        <div className="flex items-center gap-2">
          <span className={`rounded-md p-2 ${tone === 'success' ? 'bg-success-50 text-success-700' : 'bg-danger-50 text-danger-700'}`}>
            <Tags className="h-4 w-4" />
          </span>
          <div>
            <h2 className="card-title text-lg">{title}</h2>
            <p className="card-subtitle">{subtitle}</p>
          </div>
        </div>
      </div>
      <div className="card-body p-0">
        {list.length === 0 ? (
          <div className="p-6 text-sm text-neutral-500">Nenhuma categoria nesta secao.</div>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {list.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-4 px-6 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="inline-block h-3 w-3 rounded-full" style={{ background: c.color ?? '#cbd5e1' }} />
                  <span className="font-medium text-neutral-900 truncate">{c.name}</span>
                  {c.type === 'both' && <span className="badge border-neutral-200 bg-neutral-50 text-neutral-700 text-xs">Ambos</span>}
                </div>
                <span className="text-xs text-neutral-500">{c.icon ?? '—'}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

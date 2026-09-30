import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthContext';
import { apiFetch } from '../lib/api';
import { formatCurrency } from '../lib/format';
import type { Account, DashboardSummary, Transaction } from '@scf/api-contracts';
import { ArrowDownRight, ArrowUpRight, Calendar, TrendingUp, Wallet } from 'lucide-react';

export default function DashboardPage() {
  const { currentSpaceId } = useAuth();
  const month = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; })();

  const summary = useQuery({
    queryKey: ['summary', currentSpaceId, month],
    enabled: !!currentSpaceId,
    queryFn: () => apiFetch<DashboardSummary>(`/financial-spaces/${currentSpaceId}/transactions/summary/dashboard?month=${month}`),
  });
  const accounts = useQuery({
    queryKey: ['accounts', currentSpaceId],
    enabled: !!currentSpaceId,
    queryFn: () => apiFetch<Account[]>(`/financial-spaces/${currentSpaceId}/accounts`),
  });
  const tx = useQuery({
    queryKey: ['transactions', currentSpaceId],
    enabled: !!currentSpaceId,
    queryFn: () => apiFetch<{ items: Transaction[] }>(`/financial-spaces/${currentSpaceId}/transactions?limit=8`),
  });

  const s = summary.data;
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-neutral-500">Visao consolidada do seu financeiro.</p>
      </header>

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard title="Receitas" value={formatCurrency(s?.totalIncome ?? 0)} tone="success" icon={ArrowUpRight} />
        <StatCard title="Despesas" value={formatCurrency(s?.totalExpense ?? 0)} tone="danger" icon={ArrowDownRight} />
        <StatCard title="Saldo realizado" value={formatCurrency(s?.realizedBalance ?? 0)} tone="brand" icon={Wallet} />
        <StatCard title="Saldo projetado" value={formatCurrency(s?.projectedBalance ?? 0)} tone="warning" icon={TrendingUp} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <div className="card-header">
            <h2 className="card-title text-lg">Lancamentos recentes</h2>
            <p className="card-subtitle">Atalho: Ctrl+N para um novo.</p>
          </div>
          <div className="card-body p-0">
            {(tx.data?.items ?? []).length === 0
              ? <div className="p-10 text-center text-sm text-neutral-500">Ainda sem lancamentos.</div>
              : <ul className="divide-y divide-neutral-100">
                  {(tx.data?.items ?? []).map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-4 px-6 py-3">
                      <div>
                        <div className="font-medium text-neutral-900">{t.description}</div>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-neutral-500">
                          <Calendar className="h-3 w-3" /> {t.effectiveDate} · <span className="uppercase">{t.type}</span> · <span>{t.status}</span>
                        </div>
                      </div>
                      <span className={`font-semibold ${t.type === 'income' ? 'text-success-700' : t.type === 'expense' ? 'text-danger-700' : 'text-neutral-900'}`}>
                        {formatCurrency(t.totalAmount)}
                      </span>
                    </li>
                  ))}
                </ul>
            }
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <h2 className="card-title text-lg">Contas</h2>
            <p className="card-subtitle">Cadastre contas, cartoes e carteiras.</p>
          </div>
          <div className="card-body p-0">
            {(accounts.data ?? []).length === 0
              ? <div className="p-10 text-center text-sm text-neutral-500">Nenhuma conta cadastrada.</div>
              : <ul className="divide-y divide-neutral-100">
                  {(accounts.data ?? []).map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-4 px-6 py-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="h-3 w-3 rounded-full" style={{ background: a.color ?? '#cbd5e1' }} />
                          <span className="font-medium text-neutral-900">{a.name}</span>
                        </div>
                        <div className="mt-0.5 text-xs text-neutral-500">{a.type}</div>
                      </div>
                      <span className="font-semibold">{formatCurrency(a.initialBalance)}</span>
                    </li>
                  ))}
                </ul>
            }
          </div>
        </section>
      </div>
    </div>
  );
}

function StatCard({ title, value, tone, icon: Icon }: { title: string; value: string; tone: 'brand' | 'success' | 'warning' | 'danger'; icon: React.ComponentType<{ className?: string }> }) {
  const ring = {
    brand: 'bg-brand-50 text-brand-700',
    success: 'bg-success-50 text-success-700',
    warning: 'bg-warning-50 text-warning-700',
    danger: 'bg-danger-50 text-danger-700',
  }[tone];
  return (
    <div className="card p-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm text-neutral-500">{title}</div>
          <div className="mt-2 text-2xl font-bold">{value}</div>
        </div>
        <span className={`grid h-10 w-10 place-items-center rounded-lg ${ring}`}><Icon className="h-5 w-5" /></span>
      </div>
    </div>
  );
}

'use client';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useAuth } from '@/components/auth/AuthContext';
import { apiFetch } from '@/lib/api-client';
import { formatCurrency, monthLabel } from '@/lib/format';
import type { DashboardSummary, Account, Transaction } from '@scf/api-contracts';
import { ArrowDownRight, ArrowUpRight, Calendar, CreditCard, TrendingUp, Wallet } from 'lucide-react';

export default function DashboardPage() {
  const { currentSpaceId } = useAuth();
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const summaryQ = useQuery({
    queryKey: ['dashboard', 'summary', currentSpaceId, currentMonth],
    enabled: !!currentSpaceId,
    queryFn: () =>
      apiFetch<DashboardSummary>(`/financial-spaces/${currentSpaceId}/transactions/summary/dashboard?month=${currentMonth}`),
  });

  const accountsQ = useQuery({
    queryKey: ['accounts', currentSpaceId],
    enabled: !!currentSpaceId,
    queryFn: () => apiFetch<Account[]>(`/financial-spaces/${currentSpaceId}/accounts`),
  });

  const recentQ = useQuery({
    queryKey: ['transactions', 'recent', currentSpaceId],
    enabled: !!currentSpaceId,
    queryFn: () =>
      apiFetch<{ items: Transaction[] }>(`/financial-spaces/${currentSpaceId}/transactions?limit=8`),
  });

  const summary = summaryQ.data;
  const accounts = accountsQ.data ?? [];
  const recent = recentQ.data?.items ?? [];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-sm text-neutral-500">{monthLabel(currentMonth)}</div>
          <h1 className="text-2xl font-semibold tracking-tight">Resumo financeiro</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/app/transactions/new" className="btn-primary">
            Novo lancamento
          </Link>
          <Link href="/app/reports" className="btn-outline">
            Ver relatorios
          </Link>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Receitas no periodo"
          value={formatCurrency(summary?.totalIncome ?? 0)}
          tone="success"
          icon={ArrowUpRight}
          loading={summaryQ.isLoading}
        />
        <StatCard
          title="Despesas no periodo"
          value={formatCurrency(summary?.totalExpense ?? 0)}
          tone="danger"
          icon={ArrowDownRight}
          loading={summaryQ.isLoading}
        />
        <StatCard
          title="Saldo realizado"
          value={formatCurrency(summary?.realizedBalance ?? 0)}
          tone="brand"
          icon={Wallet}
          loading={summaryQ.isLoading}
        />
        <StatCard
          title="Saldo projetado"
          value={formatCurrency(summary?.projectedBalance ?? 0)}
          tone="warning"
          icon={TrendingUp}
          loading={summaryQ.isLoading}
          subtitle={`Proximos vencimentos: ${summary?.upcomingDueCount ?? 0}`}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <div className="card xl:col-span-2">
          <div className="card-header flex-row items-center justify-between gap-3">
            <div>
              <h2 className="card-title">Lancamentos recentes</h2>
              <p className="card-subtitle">Ultimas movimentacoes registradas</p>
            </div>
            <Link href="/app/transactions" className="btn-outline text-sm">
              Ver todos
            </Link>
          </div>
          <div className="card-body p-0">
            {recentQ.isLoading ? (
              <SkeletonTable rows={5} />
            ) : recent.length === 0 ? (
              <EmptyState title="Sem lancamentos ainda" subtitle="Clique em 'Novo lancamento' para registrar a primeira movimentacao." />
            ) : (
              <div className="divide-y divide-neutral-100">
                {recent.map((t) => (
                  <div key={t.id} className="flex items-center justify-between gap-4 px-6 py-3">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-neutral-900">{t.description}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {t.effectiveDate}
                        </span>
                        <span className={`badge ${txStatusBadge(t.status)}`}>{t.status}</span>
                        <span>{t.type}</span>
                      </div>
                    </div>
                    <div className={`text-sm font-semibold ${txAmountColor(t.type)}`}>
                      {(t.type === 'income' ? '+' : t.type === 'expense' ? '-' : '')} {formatCurrency(t.totalAmount)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Contas</h2>
            <p className="card-subtitle">Saldos das contas cadastradas</p>
          </div>
          <div className="card-body p-0">
            {accountsQ.isLoading ? (
              <SkeletonTable rows={4} />
            ) : accounts.length === 0 ? (
              <EmptyState title="Nenhuma conta cadastrada" subtitle="Cadastre sua conta corrente, carteira e poupanca para começar." href="/app/accounts" hrefLabel="Cadastrar contas" />
            ) : (
              <div className="divide-y divide-neutral-100">
                {accounts.map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-4 px-6 py-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="inline-block h-3 w-3 rounded-full" style={{ background: a.color ?? '#cbd5e1' }} />
                        <span className="truncate font-medium text-neutral-900">{a.name}</span>
                      </div>
                      <div className="mt-0.5 text-xs text-neutral-500">{a.type} · {a.currency}</div>
                    </div>
                    <div className="text-sm font-semibold">{formatCurrency(a.initialBalance)}</div>
                  </div>
                ))}
              </div>
            )}
            <div className="border-t border-neutral-100 px-6 py-3">
              <Link href="/app/accounts/new" className="btn-outline w-full">
                <CreditCard className="h-4 w-4" /> Nova conta
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function StatCard({
  title,
  value,
  tone,
  icon: Icon,
  loading,
  subtitle,
}: {
  title: string;
  value: string;
  tone: 'brand' | 'success' | 'warning' | 'danger';
  icon: React.ComponentType<{ className?: string }>;
  loading?: boolean;
  subtitle?: string;
}) {
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
          <div className={`mt-2 text-2xl font-bold ${loading ? 'h-8 w-24 animate-pulse rounded bg-neutral-100' : ''}`}>
            {loading ? '' : value}
          </div>
          {subtitle && <div className="mt-1 text-xs text-neutral-500">{subtitle}</div>}
        </div>
        <span className={`grid h-10 w-10 place-items-center rounded-lg ${ring}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </div>
  );
}

function txStatusBadge(s: string) {
  switch (s) {
    case 'confirmed':
      return 'border-success-200 bg-success-50 text-success-700';
    case 'pending':
      return 'border-warning-200 bg-warning-50 text-warning-700';
    case 'scheduled':
      return 'border-neutral-200 bg-neutral-50 text-neutral-700';
    case 'canceled':
      return 'border-danger-200 bg-danger-50 text-danger-700';
    default:
      return 'border-neutral-200 bg-neutral-50 text-neutral-700';
  }
}

function txAmountColor(t: string) {
  switch (t) {
    case 'income':
      return 'text-success-700';
    case 'expense':
      return 'text-danger-700';
    default:
      return 'text-neutral-900';
  }
}

function SkeletonTable({ rows }: { rows: number }) {
  return (
    <div className="p-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3">
          <div className="h-5 w-5/6 animate-pulse rounded bg-neutral-100" />
          <div className="h-5 w-20 animate-pulse rounded bg-neutral-100" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({
  title,
  subtitle,
  href,
  hrefLabel,
}: {
  title: string;
  subtitle: string;
  href?: string;
  hrefLabel?: string;
}) {
  return (
    <div className="p-10 text-center">
      <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-neutral-100 text-neutral-500">
        <Wallet className="h-5 w-5" />
      </div>
      <div className="text-base font-medium text-neutral-800">{title}</div>
      <div className="mx-auto mt-1 max-w-xs text-sm text-neutral-500">{subtitle}</div>
      {href && hrefLabel && (
        <Link href={href} className="btn-primary mt-4">
          {hrefLabel}
        </Link>
      )}
    </div>
  );
}

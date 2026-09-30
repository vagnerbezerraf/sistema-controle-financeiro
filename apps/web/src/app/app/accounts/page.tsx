'use client';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useAuth } from '@/components/auth/AuthContext';
import { apiFetch } from '@/lib/api-client';
import { formatCurrency } from '@/lib/format';
import type { Account } from '@scf/api-contracts';
import { Plus, ArrowRight } from 'lucide-react';

export default function AccountsPage() {
  const { currentSpaceId } = useAuth();
  const q = useQuery({
    queryKey: ['accounts', currentSpaceId],
    enabled: !!currentSpaceId,
    queryFn: () => apiFetch<Account[]>(`/financial-spaces/${currentSpaceId}/accounts`),
  });
  const accounts = q.data ?? [];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Contas</h1>
          <p className="text-sm text-neutral-500">
            Contas correntes, poupanca, carteira e outras carteiras digitais.
          </p>
        </div>
        <Link href="/app/accounts/new" className="btn-primary">
          <Plus className="h-4 w-4" /> Nova conta
        </Link>
      </header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {q.isLoading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="card p-6">
                <div className="h-5 w-1/2 animate-pulse rounded bg-neutral-100" />
                <div className="mt-3 h-8 w-1/3 animate-pulse rounded bg-neutral-100" />
              </div>
            ))
          : accounts.map((a) => (
              <Link key={a.id} href={`/app/accounts/${a.id}`} className="card transition-fast hover:-translate-y-0.5 hover:shadow-md">
                <div className="card-body flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="inline-block h-3 w-3 rounded-full" style={{ background: a.color ?? '#cbd5e1' }} />
                      <span className="font-semibold text-neutral-900">{a.name}</span>
                    </div>
                    <div className="mt-1 text-xs uppercase tracking-wide text-neutral-500">{a.type} · {a.currency}</div>
                    <div className="mt-4 text-2xl font-bold">{formatCurrency(a.initialBalance)}</div>
                    <div className="mt-1 text-xs text-neutral-500">Saldo inicial em {a.initialBalanceDate}</div>
                  </div>
                  <span className="rounded-full bg-neutral-100 p-2 text-neutral-500">
                    <ArrowRight className="h-4 w-4" />
                  </span>
                </div>
              </Link>
            ))}
      </div>
    </div>
  );
}

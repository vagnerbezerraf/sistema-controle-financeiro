import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthContext';
import { apiFetch } from '../lib/api';
import { formatCurrency } from '../lib/format';
import type { Account } from '@scf/api-contracts';

export default function AccountsPage() {
  const { currentSpaceId } = useAuth();
  const q = useQuery({
    queryKey: ['accounts', currentSpaceId],
    enabled: !!currentSpaceId,
    queryFn: () => apiFetch<Account[]>(`/financial-spaces/${currentSpaceId}/accounts`),
  });
  const items = q.data ?? [];
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Contas</h1>
        <p className="text-sm text-neutral-500">Contas correntes, poupanca, carteiras e cartoes.</p>
      </header>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map((a) => (
          <div key={a.id} className="card p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ background: a.color ?? '#cbd5e1' }} />
                <span className="font-semibold text-neutral-900">{a.name}</span>
              </div>
              <span className="badge border-neutral-200 bg-neutral-50 text-neutral-700 uppercase">{a.type}</span>
            </div>
            <div className="mt-4 text-2xl font-bold">{formatCurrency(a.initialBalance)}</div>
            <div className="mt-1 text-xs text-neutral-500">{a.currency} · Criada em {a.initialBalanceDate}</div>
          </div>
        ))}
      </section>
    </div>
  );
}

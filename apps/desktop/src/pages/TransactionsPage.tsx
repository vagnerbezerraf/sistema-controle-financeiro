import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthContext';
import { apiFetch } from '../lib/api';
import { formatCurrency } from '../lib/format';
import type { Transaction } from '@scf/api-contracts';

export default function TransactionsPage() {
  const { currentSpaceId } = useAuth();
  const q = useQuery({
    queryKey: ['transactions', 'list', currentSpaceId],
    enabled: !!currentSpaceId,
    queryFn: () => apiFetch<{ items: Transaction[]; total: number }>(`/financial-spaces/${currentSpaceId}/transactions?limit=50`),
  });
  const items = q.data?.items ?? [];
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Lancamentos</h1>
        <p className="text-sm text-neutral-500">Historico de receitas, despesas, transferencias e ajustes.</p>
      </header>
      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-6 py-3 font-medium">Descricao</th>
                <th className="px-6 py-3 font-medium">Data</th>
                <th className="px-6 py-3 font-medium">Tipo</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 text-right font-medium">Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {items.map((t) => (
                <tr key={t.id} className="hover:bg-neutral-50">
                  <td className="px-6 py-3">{t.description}</td>
                  <td className="px-6 py-3 text-neutral-700">{t.effectiveDate}</td>
                  <td className="px-6 py-3 uppercase text-neutral-600">{t.type}</td>
                  <td className="px-6 py-3">{t.status}</td>
                  <td className={`px-6 py-3 text-right font-semibold ${t.type === 'income' ? 'text-success-700' : t.type === 'expense' ? 'text-danger-700' : 'text-neutral-900'}`}>
                    {formatCurrency(t.totalAmount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

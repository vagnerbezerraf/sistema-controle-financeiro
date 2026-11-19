'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/components/auth/AuthContext';
import { apiFetch } from '@/lib/api-client';
import { formatCurrency, formatDate, cls } from '@/lib/format';
import type { BalanceProjectionView } from '@scf/api-contracts';
import { AlertTriangle, TrendingUp } from 'lucide-react';

/** Horizontes oferecidos para a projecao de saldo. */
const HORIZONS = [15, 30, 90];

export default function ProjectionPage() {
  const { currentSpaceId } = useAuth();
  const [horizonDays, setHorizonDays] = useState(30);

  const projectionQ = useQuery({
    queryKey: ['projection', currentSpaceId, horizonDays],
    enabled: !!currentSpaceId,
    queryFn: () =>
      apiFetch<BalanceProjectionView>(
        `/financial-spaces/${currentSpaceId}/summary/projection?horizonDays=${horizonDays}`,
      ),
  });

  const data = projectionQ.data;
  const points = data?.points ?? [];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Saldo projetado</h1>
          <p className="text-sm text-neutral-500">
            Caminha o saldo realizado para frente somando as contas em aberto pelo vencimento.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label htmlFor="projectionHorizon" className="label block">
              Horizonte (dias)
            </label>
            <select
              id="projectionHorizon"
              data-testid="projecao-horizonte"
              className="input mt-1"
              value={horizonDays}
              onChange={(e) => setHorizonDays(Number(e.target.value))}
            >
              {HORIZONS.map((d) => (
                <option key={d} value={d}>
                  {d} dias
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <SummaryCard
          testid="projecao-saldo-atual"
          label="Saldo atual"
          value={data?.openingBalance ?? '0'}
          tone="text-neutral-900"
        />
        <SummaryCard
          testid="projecao-saldo-final"
          label={`Saldo em ${horizonDays} dias`}
          value={data?.closingBalance ?? '0'}
          tone={Number(data?.closingBalance ?? 0) < 0 ? 'text-danger-700' : 'text-brand-700'}
        />
        <SummaryCard
          testid="projecao-menor-saldo"
          label="Menor saldo no periodo"
          value={data?.minBalance ?? '0'}
          tone={data?.willGoNegative ? 'text-danger-700' : 'text-neutral-900'}
        />
      </section>

      {data?.willGoNegative && (
        <div
          data-testid="projecao-aviso-negativo"
          className="flex items-center gap-3 rounded-md border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700"
        >
          <AlertTriangle className="h-5 w-5" />
          O saldo fica negativo em {formatDate(data.minBalanceDate)} ({formatCurrency(data.minBalance)}).
        </div>
      )}

      <section className="card">
        <div className="card-header">
          <h2 className="card-title">Proximos movimentos</h2>
          <p className="card-subtitle">
            {data ? `${data.upcomingCount} compromisso(s) · saida prevista ${formatCurrency(data.upcomingAmount)}` : ' '}
          </p>
        </div>
        <div className="card-body">
          {projectionQ.isLoading && <p className="text-sm text-neutral-500">Carregando...</p>}
          {!projectionQ.isLoading && points.length === 0 && (
            <div className="flex items-center gap-3 text-sm text-neutral-600">
              <TrendingUp className="h-5 w-5 text-neutral-400" />
              Nenhum movimento previsto no periodo.
            </div>
          )}

          {points.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-neutral-500">
                  <th className="py-2">Dia</th>
                  <th className="py-2 text-right">Entradas</th>
                  <th className="py-2 text-right">Saidas</th>
                  <th className="py-2 text-right">Saldo do dia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {points.map((point) => (
                  <tr key={point.date} data-testid={`projecao-ponto-${point.date}`}>
                    <td className="py-2 text-neutral-700">{formatDate(point.date)}</td>
                    <td className="py-2 text-right text-success-700">
                      {Number(point.inflow) > 0 ? formatCurrency(point.inflow) : '-'}
                    </td>
                    <td className="py-2 text-right text-neutral-900">
                      {Number(point.outflow) > 0 ? formatCurrency(point.outflow) : '-'}
                    </td>
                    <td
                      data-testid={`projecao-saldo-${point.date}`}
                      className={cls(
                        'py-2 text-right font-semibold',
                        Number(point.balance) < 0 ? 'text-danger-700' : 'text-neutral-900',
                      )}
                    >
                      {formatCurrency(point.balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
  testid,
}: {
  label: string;
  value: string;
  tone: string;
  testid: string;
}) {
  return (
    <div className="card" data-testid={testid}>
      <div className="card-body">
        <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
        <div className={cls('mt-1 text-2xl font-semibold', tone)}>{formatCurrency(value)}</div>
      </div>
    </div>
  );
}

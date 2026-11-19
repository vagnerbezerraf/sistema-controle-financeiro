'use client';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/components/auth/AuthContext';
import { apiFetch } from '@/lib/api-client';
import { cls, formatCurrency, formatPercent, monthLabel } from '@/lib/format';
import type { AdvancedReportView, MetricComparison, MonthlyComparisonView } from '@scf/api-contracts';
import { BarChart3 } from 'lucide-react';

export default function ReportsPage() {
  const { currentSpaceId } = useAuth();
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const comparisonQ = useQuery({
    queryKey: ['monthly-comparison', currentSpaceId, currentMonth],
    enabled: !!currentSpaceId,
    queryFn: () =>
      apiFetch<MonthlyComparisonView>(
        `/financial-spaces/${currentSpaceId}/summary/monthly-comparison?month=${currentMonth}`,
      ),
  });

  const advancedQ = useQuery({
    queryKey: ['advanced-report', currentSpaceId, currentMonth],
    enabled: !!currentSpaceId,
    queryFn: () =>
      apiFetch<AdvancedReportView>(
        `/financial-spaces/${currentSpaceId}/summary/advanced-report?month=${currentMonth}`,
      ),
  });

  const data = comparisonQ.data;
  const report = advancedQ.data;
  const hasData = !!data && (
    Number(data.current.income) !== 0 ||
    Number(data.current.expense) !== 0 ||
    Number(data.previous.income) !== 0 ||
    Number(data.previous.expense) !== 0
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Relatorios</h1>
        <p className="text-sm text-neutral-500">
          Comparacao dos totais realizados com o mes anterior, sem distorcer o historico.
        </p>
      </header>

      <section className="card" data-testid="comparativo-mensal">
        <div className="card-header">
          <h2 className="card-title">Comparacao mensal</h2>
          <p className="card-subtitle">
            {data
              ? `${monthLabel(data.current.month)} vs. ${monthLabel(data.previous.month)}`
              : 'Receitas, despesas e liquido'}
          </p>
        </div>
        <div className="card-body">
          {comparisonQ.isLoading && <p className="text-sm text-neutral-500">Carregando...</p>}

          {!comparisonQ.isLoading && !hasData && (
            <div
              data-testid="comparativo-vazio"
              className="flex items-center gap-3 text-sm text-neutral-600"
            >
              <BarChart3 className="h-5 w-5 text-neutral-400" />
              Sem lancamentos confirmados no mes atual nem no anterior.
            </div>
          )}

          {!comparisonQ.isLoading && hasData && data && (
            <div className="grid gap-4 md:grid-cols-3">
              <ComparisonCard
                testid="comparativo-receitas"
                label="Receitas"
                metric={data.comparison.income}
                higherIsBetter
              />
              <ComparisonCard
                testid="comparativo-despesas"
                label="Despesas"
                metric={data.comparison.expense}
                higherIsBetter={false}
              />
              <ComparisonCard
                testid="comparativo-liquido"
                label="Liquido"
                metric={data.comparison.net}
                higherIsBetter
              />
            </div>
          )}
        </div>
      </section>

      <section className="card" data-testid="relatorios-avancados">
        <div className="card-header">
          <h2 className="card-title">Relatorios avancados</h2>
          <p className="card-subtitle">
            Patrimonio liquido, taxa de poupanca e evolucao dos ultimos meses.
          </p>
        </div>
        <div className="card-body space-y-6">
          {advancedQ.isLoading && <p className="text-sm text-neutral-500">Carregando...</p>}

          {!advancedQ.isLoading && report && (
            <>
              <div data-testid="patrimonio-liquido">
                <h3 className="mb-3 text-sm font-medium text-neutral-700">Patrimonio liquido</h3>
                <div className="grid gap-4 md:grid-cols-3">
                  <Stat testid="patrimonio-ativos" label="Ativos" value={formatCurrency(report.netWorth.assets)} />
                  <Stat
                    testid="patrimonio-passivos"
                    label="Passivos"
                    value={formatCurrency(report.netWorth.liabilities)}
                  />
                  <Stat
                    testid="patrimonio-liquido-valor"
                    label="Patrimonio liquido"
                    value={formatCurrency(report.netWorth.netWorth)}
                    highlight
                  />
                </div>
                {report.netWorth.accounts.length > 0 && (
                  <ul className="mt-3 space-y-1 text-sm text-neutral-600">
                    {report.netWorth.accounts.map((account) => (
                      <li key={account.accountId} className="flex justify-between gap-4">
                        <span>{account.name}</span>
                        <span className={Number(account.balance) < 0 ? 'text-danger-700' : undefined}>
                          {formatCurrency(account.balance)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div data-testid="taxa-poupanca">
                <h3 className="mb-3 text-sm font-medium text-neutral-700">Taxa de poupanca</h3>
                <div className="grid gap-4 md:grid-cols-3">
                  <Stat testid="poupanca-receitas" label="Receitas do mes" value={formatCurrency(report.savings.income)} />
                  <Stat testid="poupanca-despesas" label="Despesas do mes" value={formatCurrency(report.savings.expense)} />
                  <Stat
                    testid="poupanca-taxa"
                    label="Taxa de poupanca"
                    value={report.savings.rate === null ? 'Sem base' : formatPercent(report.savings.rate)}
                    highlight
                  />
                </div>
                <p className="mt-2 text-xs text-neutral-500">
                  Sobrou {formatCurrency(report.savings.saved)} em {monthLabel(report.savings.month)}.
                </p>
              </div>

              <div data-testid="evolucao-mensal">
                <h3 className="mb-3 text-sm font-medium text-neutral-700">Evolucao mensal</h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-neutral-500">
                      <th className="py-1 font-medium">Mes</th>
                      <th className="py-1 text-right font-medium">Receitas</th>
                      <th className="py-1 text-right font-medium">Despesas</th>
                      <th className="py-1 text-right font-medium">Liquido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.evolution.map((point) => (
                      <tr
                        key={point.month}
                        className="border-t border-neutral-100"
                        data-testid={`evolucao-${point.month}`}
                      >
                        <td className="py-1.5 text-neutral-700">{monthLabel(point.month)}</td>
                        <td className="py-1.5 text-right text-neutral-600">{formatCurrency(point.income)}</td>
                        <td className="py-1.5 text-right text-neutral-600">{formatCurrency(point.expense)}</td>
                        <td
                          className={cls(
                            'py-1.5 text-right font-medium',
                            Number(point.net) < 0 ? 'text-danger-700' : 'text-neutral-800',
                          )}
                        >
                          {formatCurrency(point.net)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function ComparisonCard({
  testid,
  label,
  metric,
  higherIsBetter,
}: {
  testid: string;
  label: string;
  metric: MetricComparison;
  higherIsBetter: boolean;
}) {
  const delta = Number(metric.delta);
  const good = delta === 0 ? null : delta > 0 === higherIsBetter;
  const tone = good === null ? 'text-neutral-500' : good ? 'text-success-700' : 'text-danger-700';
  const sign = delta > 0 ? '+' : '';

  return (
    <div className="rounded-md border border-neutral-200 p-4" data-testid={testid}>
      <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-neutral-900">
        {formatCurrency(metric.current)}
      </div>
      <div className="mt-1 text-xs text-neutral-500">
        Mes anterior: {formatCurrency(metric.previous)}
      </div>
      <div className={cls('mt-2 text-sm font-medium', tone)}>
        {sign}
        {formatCurrency(metric.delta)}{' '}
        <span data-testid={`${testid}-percentual`}>
          ({metric.deltaPercent === null ? 'sem base' : formatPercent(metric.deltaPercent)})
        </span>
      </div>
    </div>
  );
}

function Stat({
  testid,
  label,
  value,
  highlight,
}: {
  testid: string;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-md border border-neutral-200 p-4" data-testid={testid}>
      <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
      <div className={cls('mt-1 text-2xl font-semibold', highlight ? 'text-neutral-900' : 'text-neutral-800')}>
        {value}
      </div>
    </div>
  );
}

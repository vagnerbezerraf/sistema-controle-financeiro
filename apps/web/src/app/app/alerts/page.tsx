'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/components/auth/AuthContext';
import { apiFetch } from '@/lib/api-client';
import { formatCurrency, formatDate, cls } from '@/lib/format';
import type {
  AlertEntry,
  AlertSeverity,
  AlertsView,
  PlanningAlertsView,
} from '@scf/api-contracts';
import { BellRing, PiggyBank, TrendingUp } from 'lucide-react';

/** Horizontes oferecidos para o alerta "vence em breve". */
const HORIZONS = [7, 15, 30];
/** Horizonte fixo do alerta de saldo projetado (o orcamento e sempre do mes). */
const PLANNING_HORIZON_DAYS = 30;

export default function AlertsPage() {
  const { currentSpaceId } = useAuth();
  const [horizonDays, setHorizonDays] = useState(7);

  const alertsQ = useQuery({
    queryKey: ['alerts', currentSpaceId, horizonDays],
    enabled: !!currentSpaceId,
    queryFn: () =>
      apiFetch<AlertsView>(
        `/financial-spaces/${currentSpaceId}/alerts?horizonDays=${horizonDays}`,
      ),
  });

  const planningQ = useQuery({
    queryKey: ['planning-alerts', currentSpaceId, PLANNING_HORIZON_DAYS],
    enabled: !!currentSpaceId,
    queryFn: () =>
      apiFetch<PlanningAlertsView>(
        `/financial-spaces/${currentSpaceId}/summary/planning-alerts?horizonDays=${PLANNING_HORIZON_DAYS}`,
      ),
  });

  const data = alertsQ.data;
  const alerts = data?.alerts ?? [];
  const planning = planningQ.data;
  const budgetAlerts = planning?.budgetAlerts ?? [];
  const hasPlanning = !!planning?.negativeBalance || budgetAlerts.length > 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Alertas</h1>
          <p className="text-sm text-neutral-500">
            Vencimentos proximos, orcamentos em risco e saldo projetado, sem distorcer o realizado.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label htmlFor="alertHorizon" className="label block">
              Vence em breve (dias)
            </label>
            <select
              id="alertHorizon"
              data-testid="alertas-horizonte"
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
        <SummaryCard testid="alertas-vencidas" label="Vencidas" value={data?.counts.overdue ?? 0} tone="text-warning-700" />
        <SummaryCard testid="alertas-hoje" label="Vencem hoje" value={data?.counts.dueToday ?? 0} tone="text-danger-700" />
        <SummaryCard
          testid="alertas-breve"
          label={`Vencem em ate ${horizonDays} dias`}
          value={data?.counts.dueSoon ?? 0}
          tone="text-brand-700"
        />
      </section>

      <section className="card">
        <div className="card-header">
          <h2 className="card-title">Vencimentos</h2>
          <p className="card-subtitle">Do mais urgente ao menos urgente</p>
        </div>
        <div className="card-body">
          {alertsQ.isLoading && <p className="text-sm text-neutral-500">Carregando...</p>}
          {!alertsQ.isLoading && alerts.length === 0 && (
            <div className="flex items-center gap-3 text-sm text-neutral-600">
              <BellRing className="h-5 w-5 text-neutral-400" />
              Nenhum vencimento no periodo.
            </div>
          )}

          <ul className="divide-y divide-neutral-100">
            {alerts.map((a) => (
              <li
                key={`${a.kind}:${a.id}`}
                data-testid={`alertas-${a.id}`}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-neutral-900">{a.description}</span>
                    <span
                      className={cls(
                        'rounded px-1.5 py-0.5 text-xs',
                        a.kind === 'invoice'
                          ? 'bg-warning-50 text-warning-700'
                          : 'bg-neutral-100 text-neutral-600',
                      )}
                    >
                      {a.kind === 'invoice' ? 'fatura' : a.type === 'income' ? 'a receber' : 'a pagar'}
                    </span>
                    <span className={`badge ${severityBadge(a.severity)}`}>
                      {severityLabel(a.severity)}
                    </span>
                  </div>
                  <div className="text-xs text-neutral-500">
                    vence {formatDate(a.dueDate)} · {dueLabel(a)}
                  </div>
                </div>
                <div
                  className={cls(
                    'font-semibold',
                    a.type === 'income' ? 'text-success-700' : 'text-neutral-900',
                  )}
                >
                  {formatCurrency(a.amount)}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="card" data-testid="alertas-planejamento">
        <div className="card-header">
          <h2 className="card-title">Planejamento</h2>
          <p className="card-subtitle">
            Orcamentos em risco e saldo projetado nos proximos {PLANNING_HORIZON_DAYS} dias
          </p>
        </div>
        <div className="card-body space-y-3">
          {planningQ.isLoading && <p className="text-sm text-neutral-500">Carregando...</p>}
          {!planningQ.isLoading && !hasPlanning && (
            <div
              data-testid="alertas-planejamento-vazio"
              className="flex items-center gap-3 text-sm text-neutral-600"
            >
              <TrendingUp className="h-5 w-5 text-neutral-400" />
              Nenhum alerta de planejamento no momento.
            </div>
          )}

          {planning?.negativeBalance && (
            <div
              data-testid="alertas-saldo-negativo"
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-danger-200 bg-danger-50 px-3 py-3"
            >
              <div className="flex items-center gap-2 text-sm text-danger-700">
                <TrendingUp className="h-5 w-5" />
                <span>
                  Saldo projetado negativo em {formatDate(planning.negativeBalance.minBalanceDate)}
                </span>
              </div>
              <div className="font-semibold text-danger-700">
                {formatCurrency(planning.negativeBalance.minBalance)}
              </div>
            </div>
          )}

          <ul className="divide-y divide-neutral-100">
            {budgetAlerts.map((b) => (
              <li
                key={b.budgetId}
                data-testid={`alertas-orcamento-${b.budgetId}`}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <PiggyBank className="h-4 w-4 text-neutral-400" />
                    <span className="font-medium text-neutral-900">
                      {b.categoryName ?? 'Orcamento geral'}
                    </span>
                    <span
                      className={cls(
                        'badge',
                        b.status === 'exceeded'
                          ? 'border-danger-200 bg-danger-50 text-danger-700'
                          : 'border-warning-200 bg-warning-50 text-warning-700',
                      )}
                    >
                      {b.status === 'exceeded' ? 'Estourado' : 'Em atencao'}
                    </span>
                  </div>
                  <div className="text-xs text-neutral-500">
                    {formatCurrency(b.spentAmount)} de {formatCurrency(b.amountLimit)} ·{' '}
                    {b.usagePercent}%
                  </div>
                </div>
                <div
                  className={cls(
                    'font-semibold',
                    b.status === 'exceeded' ? 'text-danger-700' : 'text-warning-700',
                  )}
                >
                  {formatCurrency(b.remainingAmount)}
                </div>
              </li>
            ))}
          </ul>
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
  value: number;
  tone: string;
  testid: string;
}) {
  return (
    <div className="card" data-testid={testid}>
      <div className="card-body">
        <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
        <div className={cls('mt-1 text-2xl font-semibold', tone)}>{value}</div>
      </div>
    </div>
  );
}

function severityLabel(severity: AlertSeverity): string {
  switch (severity) {
    case 'overdue':
      return 'Vencida';
    case 'due_today':
      return 'Vence hoje';
    default:
      return 'Vence em breve';
  }
}

function severityBadge(severity: AlertSeverity): string {
  switch (severity) {
    case 'overdue':
      return 'border-warning-200 bg-warning-50 text-warning-700';
    case 'due_today':
      return 'border-danger-200 bg-danger-50 text-danger-700';
    default:
      return 'border-brand-200 bg-brand-50 text-brand-700';
  }
}

function dueLabel(alert: AlertEntry): string {
  if (alert.daysUntilDue < 0) {
    const atraso = Math.abs(alert.daysUntilDue);
    return `${atraso} ${atraso === 1 ? 'dia' : 'dias'} em atraso`;
  }
  if (alert.daysUntilDue === 0) return 'vence hoje';
  return `em ${alert.daysUntilDue} ${alert.daysUntilDue === 1 ? 'dia' : 'dias'}`;
}

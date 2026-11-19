/**
 * Alertas de vencimento.
 *
 * Como o calendario, os alertas sao uma **leitura derivada**: nada e gravado e
 * nenhum job e necessario. A funcao pura classifica cada compromisso em aberto
 * pela proximidade do vencimento (vencido, vence hoje, vence em breve), o que
 * permite testar a regra sem banco.
 *
 * A comparacao de datas e feita apenas pelo dia (UTC), pelo mesmo motivo do
 * resto do dominio: o vencimento de uma conta e um dia, nao um instante.
 */
import type { CalendarEntryInput } from './calendar';

/** Quantos dias a frente entram no alerta "vence em breve" (padrao). */
export const DEFAULT_ALERT_HORIZON_DAYS = 7;

/** Situacoes de obrigacao que ainda representam um compromisso em aberto. */
const OPEN_OBLIGATION_STATUSES = ['forecast', 'pending', 'partially_reconciled'];

export type AlertSeverity = 'overdue' | 'due_today' | 'due_soon';

export interface AlertEntry extends CalendarEntryInput {
  severity: AlertSeverity;
  /** Dias ate o vencimento (negativo quando ja venceu). */
  daysUntilDue: number;
}

export interface AlertsView {
  today: string;
  horizonDays: number;
  counts: {
    overdue: number;
    dueToday: number;
    dueSoon: number;
    total: number;
  };
  alerts: AlertEntry[];
}

const isoDay = (value: string): string => value.slice(0, 10);
const DAY_MS = 24 * 60 * 60 * 1000;

/** Diferenca em dias inteiros entre dois dias (`YYYY-MM-DD`). */
function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${isoDay(from)}T00:00:00.000Z`);
  const b = Date.parse(`${isoDay(to)}T00:00:00.000Z`);
  return Math.round((b - a) / DAY_MS);
}

/**
 * Uma fatura ja vem quitada ou nao do provedor (`outstandingAmount > 0`), entao
 * entra sempre; uma obrigacao so entra se ainda estiver em aberto (a conciliada
 * deixa de ser um compromisso).
 */
function isOpen(entry: CalendarEntryInput): boolean {
  return entry.kind === 'invoice' || OPEN_OBLIGATION_STATUSES.includes(entry.status);
}

/**
 * Classifica as entradas em aberto pela proximidade do vencimento, descartando
 * o que esta alem do horizonte e ordenando do mais urgente ao menos urgente.
 */
export function buildAlerts(
  entries: CalendarEntryInput[],
  options: { today?: Date; horizonDays?: number } = {},
): AlertsView {
  const today = (options.today ?? new Date()).toISOString().slice(0, 10);
  const horizonDays = options.horizonDays ?? DEFAULT_ALERT_HORIZON_DAYS;

  const alerts: AlertEntry[] = [];
  for (const entry of entries) {
    if (!isOpen(entry)) continue;

    const dueDate = isoDay(entry.dueDate);
    const daysUntilDue = daysBetween(today, dueDate);
    if (daysUntilDue > horizonDays) continue;

    const severity: AlertSeverity =
      daysUntilDue < 0 ? 'overdue' : daysUntilDue === 0 ? 'due_today' : 'due_soon';

    alerts.push({ ...entry, dueDate, severity, daysUntilDue, overdue: severity === 'overdue' });
  }

  alerts.sort((a, b) => {
    if (a.daysUntilDue !== b.daysUntilDue) return a.daysUntilDue - b.daysUntilDue;
    return a.description.localeCompare(b.description);
  });

  return {
    today,
    horizonDays,
    counts: {
      overdue: alerts.filter((a) => a.severity === 'overdue').length,
      dueToday: alerts.filter((a) => a.severity === 'due_today').length,
      dueSoon: alerts.filter((a) => a.severity === 'due_soon').length,
      total: alerts.length,
    },
    alerts,
  };
}

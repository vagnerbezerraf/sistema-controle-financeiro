/**
 * Lembretes de vencimento no worker (Fase 2).
 *
 * Diferente do alerta da API (leitura derivada sob demanda), aqui o worker
 * **envia** o lembrete de forma proativa: seleciona as obrigacoes em aberto que
 * vencem dentro do horizonte (incluindo as atrasadas, ate um limite de
 * retrospecto) e compoe a mensagem para cada destinatario que aceita e-mail e
 * nao esta em horario silencioso.
 *
 * Tudo aqui e funcao pura sobre dias/datas, para ser testavel sem banco e sem
 * relogio global.
 */

/** Situacoes de obrigacao que ainda representam um compromisso em aberto. */
export const OPEN_OBLIGATION_STATUSES = ['forecast', 'pending', 'partially_reconciled'] as const;

/** Quantos dias a frente entram no lembrete (padrao). */
export const DEFAULT_REMINDER_HORIZON_DAYS = 3;

/** Ate quantos dias de atraso a obrigacao ainda gera lembrete. */
export const DEFAULT_OVERDUE_LOOKBACK_DAYS = 30;

export interface DueObligation {
  id: string;
  financialSpaceId: string;
  description: string;
  type: 'income' | 'expense';
  amount: string;
  currency: string;
  /** Dia do vencimento em `YYYY-MM-DD`. */
  dueDate: string;
  status: string;
}

/** Destinatario com as preferencias ja resolvidas pelo store. */
export interface ReminderRecipient {
  email: string;
  name: string | null;
  timezone: string;
  /** Canal e-mail habilitado para o tipo `upcoming_due`. */
  emailEnabled: boolean;
  includeAmounts: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
}

export interface ReminderMessage {
  to: string;
  subject: string;
  text: string;
  obligationIds: string[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const CLOCK_TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

const isoDayOf = (date: Date): string => date.toISOString().slice(0, 10);

/** Diferenca em dias inteiros entre dois dias (`YYYY-MM-DD`). */
function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso.slice(0, 10)}T00:00:00.000Z`);
  const b = Date.parse(`${toIso.slice(0, 10)}T00:00:00.000Z`);
  return Math.round((b - a) / DAY_MS);
}

export function isOpenObligationStatus(status: string): boolean {
  return (OPEN_OBLIGATION_STATUSES as readonly string[]).includes(status);
}

/**
 * Obrigacoes que merecem lembrete: em aberto, com vencimento de hoje ate o
 * horizonte (inclusive) ou atrasadas dentro do retrospecto. Ordena do
 * vencimento mais antigo ao mais novo (a descricao desempata).
 */
export function selectDueObligations(
  obligations: DueObligation[],
  options: {
    today: Date;
    horizonDays?: number;
    overdueLookbackDays?: number;
  },
): DueObligation[] {
  const todayIso = isoDayOf(options.today);
  const horizonDays = options.horizonDays ?? DEFAULT_REMINDER_HORIZON_DAYS;
  const lookbackDays = options.overdueLookbackDays ?? DEFAULT_OVERDUE_LOOKBACK_DAYS;

  return obligations
    .filter((obligation) => isOpenObligationStatus(obligation.status))
    .filter((obligation) => {
      const days = daysBetween(todayIso, obligation.dueDate);
      return days <= horizonDays && days >= -lookbackDays;
    })
    .sort((a, b) =>
      a.dueDate === b.dueDate ? a.description.localeCompare(b.description) : a.dueDate.localeCompare(b.dueDate),
    );
}

/** Minutos desde a meia-noite no fuso informado. */
export function minutesOfDayInTimeZone(at: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(at);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  // Alguns ambientes devolvem "24" para a meia-noite com `hour12: false`.
  return (hour % 24) * 60 + minute;
}

/**
 * A janela silenciosa e `[start, end)`. Quando `start >= end` ela cruza a
 * meia-noite (ex.: 22:00 -> 07:00). Uma janela de tamanho zero nunca silencia.
 */
export function isWithinQuietHours(start: string, end: string, minutes: number): boolean {
  const startMatch = CLOCK_TIME.exec(start);
  const endMatch = CLOCK_TIME.exec(end);
  if (!startMatch || !endMatch) return false;
  const from = Number(startMatch[1]) * 60 + Number(startMatch[2]);
  const to = Number(endMatch[1]) * 60 + Number(endMatch[2]);
  if (from === to) return false;
  if (from < to) return minutes >= from && minutes < to;
  return minutes >= from || minutes < to;
}

/** true quando o instante cai no horario silencioso do destinatario. */
export function isQuietAt(recipient: ReminderRecipient, at: Date): boolean {
  if (!recipient.quietHoursEnabled) return false;
  const minutes = minutesOfDayInTimeZone(at, recipient.timezone);
  return isWithinQuietHours(recipient.quietHoursStart, recipient.quietHoursEnd, minutes);
}

/** true quando o lembrete deve ser enviado agora (canal ligado e fora do silencio). */
export function shouldRemindNow(recipient: ReminderRecipient, at: Date): boolean {
  return recipient.emailEnabled && !isQuietAt(recipient, at);
}

/** Marca de prazo derivada da distancia ate o vencimento. */
function dueLabel(days: number): string {
  if (days < 0) return ' (atrasado)';
  if (days === 0) return ' (vence hoje)';
  return ` (em ${days} dia${days === 1 ? '' : 's'})`;
}

/**
 * Compõe a mensagem do destinatario. Os valores so entram quando a preferencia
 * `includeAmounts` esta ligada (a privacidade e por usuario).
 */
export function buildReminderMessage(
  recipient: ReminderRecipient,
  obligations: DueObligation[],
  today: Date,
): ReminderMessage {
  const todayIso = isoDayOf(today);
  const lines = obligations.map((obligation) => {
    const days = daysBetween(todayIso, obligation.dueDate);
    const amount = recipient.includeAmounts ? `  ${obligation.currency} ${obligation.amount}` : '';
    return `- ${obligation.dueDate}${dueLabel(days)}  ${obligation.description}${amount}`;
  });
  const count = obligations.length;

  return {
    to: recipient.email,
    subject: `SCF: ${count} compromisso${count === 1 ? '' : 's'} a vencer`,
    text: [
      `Ola${recipient.name ? ` ${recipient.name}` : ''},`,
      '',
      'Estes compromissos estao proximos do vencimento:',
      '',
      ...lines,
      '',
      'Acesse o SCF para revisar.',
    ].join('\n'),
    obligationIds: obligations.map((obligation) => obligation.id),
  };
}

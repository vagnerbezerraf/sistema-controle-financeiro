/**
 * Motor das regras de recorrencia no worker (Fase 2).
 *
 * Espelha o dominio equivalente da API (`apps/api/src/obligations/domain/recurrence.ts`):
 * o worker precisa da mesma agenda para **estender** as previsoes ao longo do
 * tempo. O horizonte de materializacao encurta conforme os dias passam, entao um
 * job periodico regenera as ocorrencias ate `hoje + N meses`, de forma
 * idempotente (a gravacao usa o indice unico regra+vencimento).
 *
 * Tudo aqui e funcao pura sobre `Date` em UTC (as colunas do banco sao `@db.Date`).
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const RECURRENCE_FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly'] as const;
export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number];

/** Quantos meses a frente as ocorrencias sao materializadas por padrao. */
export const DEFAULT_HORIZON_MONTHS = 12;

/** Teto de ocorrencias por materializacao (protege regras com inicio remoto). */
export const MAX_OCCURRENCES_PER_GENERATION = 500;

export interface RecurrenceSchedule {
  frequency: string;
  interval: number;
  startDate: Date;
  endDate?: Date | null;
  occurrencesLimit?: number | null;
}

export function isRecurrenceFrequency(value: string): value is RecurrenceFrequency {
  return (RECURRENCE_FREQUENCIES as readonly string[]).includes(value);
}

/** Inicio do dia em UTC, descartando horas/minutos/segundos. */
function toUtcDateOnly(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Quantidade de dias do mes (monthIndex0: 0 = janeiro). */
function daysInMonth(year: number, monthIndex0: number): number {
  return new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
}

/** Ajusta um dia do mes para o ultimo dia valido quando ele nao existir. */
function clampToMonth(year: number, monthIndex0: number, day: number): Date {
  const last = daysInMonth(year, monthIndex0);
  return new Date(Date.UTC(year, monthIndex0, Math.max(1, Math.min(day, last))));
}

/**
 * Limite padrao de materializacao: o mesmo dia do mes, N meses a frente
 * (ajustado ao ultimo dia valido quando o mes alvo for mais curto).
 */
export function defaultHorizon(today: Date, months = DEFAULT_HORIZON_MONTHS): Date {
  const ref = toUtcDateOnly(today);
  return clampToMonth(ref.getUTCFullYear(), ref.getUTCMonth() + months, ref.getUTCDate());
}

/**
 * Vencimentos da regra ate `horizonEnd`.
 *
 * A sequencia comeca sempre em `startDate` (occurrencesLimit conta a partir da
 * primeira ocorrencia) e para no primeiro limite encontrado: `endDate`,
 * `horizonEnd`, `occurrencesLimit` ou `limit` ocorrencias. Como o resultado e
 * deterministico, a gravacao pode ser reexecutada sem duplicar nada.
 */
export function occurrenceDates(
  schedule: RecurrenceSchedule,
  horizonEnd: Date,
  limit = MAX_OCCURRENCES_PER_GENERATION,
): Date[] {
  if (!isRecurrenceFrequency(schedule.frequency)) {
    throw new Error(`Frequencia de recorrencia invalida: ${schedule.frequency}`);
  }
  if (!Number.isInteger(schedule.interval) || schedule.interval < 1) {
    throw new Error('O intervalo da recorrencia deve ser um inteiro positivo');
  }
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error('O limite de ocorrencias deve ser um inteiro positivo');
  }

  const start = toUtcDateOnly(schedule.startDate);
  const horizon = toUtcDateOnly(horizonEnd);
  const end = schedule.endDate ? toUtcDateOnly(schedule.endDate) : null;
  const occurrencesLimit = schedule.occurrencesLimit ?? Number.POSITIVE_INFINITY;

  const dates: Date[] = [];
  for (let index = 0; dates.length < limit && dates.length < occurrencesLimit; index += 1) {
    const date = occurrenceAt(schedule.frequency, start, schedule.interval, index);
    if (date.getTime() > horizon.getTime()) break;
    if (end && date.getTime() > end.getTime()) break;
    dates.push(date);
  }
  return dates;
}

/** N-esima ocorrencia (0 = `startDate`), sempre ancorada na data de inicio. */
function occurrenceAt(
  frequency: RecurrenceFrequency,
  start: Date,
  interval: number,
  index: number,
): Date {
  const step = index * interval;
  switch (frequency) {
    case 'daily':
      return new Date(start.getTime() + step * MS_PER_DAY);
    case 'weekly':
      return new Date(start.getTime() + step * 7 * MS_PER_DAY);
    case 'monthly':
      return clampToMonth(start.getUTCFullYear(), start.getUTCMonth() + step, start.getUTCDate());
    case 'yearly':
      return clampToMonth(start.getUTCFullYear() + step, start.getUTCMonth(), start.getUTCDate());
  }
}

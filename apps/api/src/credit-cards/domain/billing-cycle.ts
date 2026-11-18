/**
 * Regras do ciclo de faturamento do cartao de credito.
 *
 * Tudo aqui e funcao pura sobre `Date` em UTC, porque as colunas de data do
 * banco sao `@db.Date` e o Prisma as devolve a meia-noite UTC. Manter o
 * calculo isolado permite testes de unidade sem banco.
 *
 * Decisoes (documentadas em doc/05-modelo-de-dominio.md):
 * - `closingDay` e `dueDay` sao dias do mes (1..31) ajustados para o ultimo dia
 *   valido quando o mes for mais curto (ex.: 31 em fevereiro -> 28/29).
 * - Uma compra pertence a fatura cujo fechamento e o **primeiro** dia de
 *   fechamento maior ou igual a data da compra.
 * - O ciclo comeca no dia seguinte ao fechamento anterior e termina no
 *   fechamento dessa fatura.
 * - O vencimento e o primeiro dia de vencimento **estritamente posterior** ao
 *   fechamento (mesmo mes quando `dueDay > closingDay`; senao, mes seguinte).
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Inicio do dia em UTC, descartando horas/minutos/segundos. */
export function toUtcDateOnly(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Quantidade de dias do mes (monthIndex0: 0 = janeiro). */
export function daysInMonth(year: number, monthIndex0: number): number {
  return new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
}

/** Ajusta um dia do mes para o ultimo dia valido quando ele nao existir. */
export function clampToMonth(year: number, monthIndex0: number, day: number): Date {
  const last = daysInMonth(year, monthIndex0);
  return new Date(Date.UTC(year, monthIndex0, Math.max(1, Math.min(day, last))));
}

/** Primeiro dia de fechamento maior ou igual a `date`. */
export function closingDateOnOrAfter(date: Date, closingDay: number): Date {
  const ref = toUtcDateOnly(date);
  const sameMonth = clampToMonth(ref.getUTCFullYear(), ref.getUTCMonth(), closingDay);
  if (sameMonth.getTime() >= ref.getTime()) return sameMonth;
  const nextMonth = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() + 1, 1));
  return clampToMonth(nextMonth.getUTCFullYear(), nextMonth.getUTCMonth(), closingDay);
}

/** Inicio e fim do ciclo que se encerra em `closingDate`. */
export function cycleWindow(closingDate: Date, closingDay: number): { cycleStart: Date; cycleEnd: Date } {
  const closing = toUtcDateOnly(closingDate);
  const previousMonth = new Date(Date.UTC(closing.getUTCFullYear(), closing.getUTCMonth() - 1, 1));
  const previousClosing = clampToMonth(
    previousMonth.getUTCFullYear(),
    previousMonth.getUTCMonth(),
    closingDay,
  );
  return { cycleStart: new Date(previousClosing.getTime() + MS_PER_DAY), cycleEnd: closing };
}

/** Primeiro vencimento estritamente posterior ao fechamento. */
export function dueDateFor(closingDate: Date, dueDay: number): Date {
  const closing = toUtcDateOnly(closingDate);
  const sameMonth = clampToMonth(closing.getUTCFullYear(), closing.getUTCMonth(), dueDay);
  if (sameMonth.getTime() > closing.getTime()) return sameMonth;
  const nextMonth = new Date(Date.UTC(closing.getUTCFullYear(), closing.getUTCMonth() + 1, 1));
  return clampToMonth(nextMonth.getUTCFullYear(), nextMonth.getUTCMonth(), dueDay);
}

export type InvoiceStatus = 'open' | 'closed' | 'overdue' | 'paid';

/** Identidade estavel da fatura dentro do cartao: a data de fechamento. */
export function invoiceIdFor(closingDate: Date): string {
  return toUtcDateOnly(closingDate).toISOString().slice(0, 10);
}

/**
 * Situacao da fatura derivada dos valores e das datas.
 *
 * `paid` quando os creditos cobrem as compras; `overdue` quando ja passou do
 * vencimento sem pagamento; `closed` entre fechamento e vencimento; `open`
 * enquanto o ciclo ainda esta em formacao.
 */
export function invoiceStatus(opts: {
  total: number;
  paid: number;
  closingDate: Date;
  dueDate: Date;
  now: Date;
}): InvoiceStatus {
  const epsilon = 0.0001;
  if (opts.total > 0 && opts.paid >= opts.total - epsilon) return 'paid';
  const today = toUtcDateOnly(opts.now).getTime();
  if (today > toUtcDateOnly(opts.dueDate).getTime()) return 'overdue';
  if (today > toUtcDateOnly(opts.closingDate).getTime()) return 'closed';
  return 'open';
}

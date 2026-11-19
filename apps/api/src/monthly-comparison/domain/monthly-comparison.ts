/**
 * Comparacoes mensais (Fase 3).
 *
 * Como o calendario, os alertas e a projecao, e uma **leitura derivada**: nada
 * e gravado e nenhum job e necessario. A funcao pura apenas compara os totais
 * realizados de um mes com os do mes anterior, devolvendo a variacao absoluta e
 * percentual de cada metrica.
 *
 * As somas sao feitas em centavos (inteiros), pela razao habitual do dominio: a
 * representacao binaria de decimais nao e confiavel para dinheiro. O percentual
 * e `null` quando o mes anterior e zero (nao ha base de comparacao).
 */
import type { MetricComparison, MonthlyComparisonView, MonthlyMetrics } from '@scf/api-contracts';

const cents = (amount: string): number => Math.round(Number(amount) * 100);
const toAmount = (value: number): string => (value / 100).toFixed(2);
const iso = (date: Date): string => date.toISOString().slice(0, 10);

/** Totais realizados de um mes ja normalizados pelo chamador. */
export interface MonthlyTotalsInput {
  /** Competencia no formato `YYYY-MM`. */
  month: string;
  periodStart: string;
  periodEnd: string;
  income: string;
  expense: string;
}

/** Primeiro e ultimo dia (UTC) da competencia informada (`YYYY-MM`). */
export function monthRange(month: string): { from: string; to: string } {
  const [year, monthNumber] = month.split('-').map(Number);
  const first = new Date(Date.UTC(year, monthNumber - 1, 1));
  const last = new Date(Date.UTC(year, monthNumber, 0));
  return { from: iso(first), to: iso(last) };
}

/** Competencia imediatamente anterior, no formato `YYYY-MM`. */
export function previousMonth(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const previous = new Date(Date.UTC(year, monthNumber - 2, 1));
  return `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, '0')}`;
}

function toMetrics(input: MonthlyTotalsInput): MonthlyMetrics {
  const income = cents(input.income);
  const expense = cents(input.expense);
  return {
    month: input.month,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    income: toAmount(income),
    expense: toAmount(expense),
    net: toAmount(income - expense),
  };
}

function compare(currentCents: number, previousCents: number): MetricComparison {
  const delta = currentCents - previousCents;
  return {
    current: toAmount(currentCents),
    previous: toAmount(previousCents),
    delta: toAmount(delta),
    deltaPercent:
      previousCents === 0 ? null : Number(((delta / Math.abs(previousCents)) * 100).toFixed(1)),
  };
}

/** Compara o mes corrente com o anterior, metrica a metrica (receitas, despesas e liquido). */
export function buildMonthlyComparison(
  current: MonthlyTotalsInput,
  previous: MonthlyTotalsInput,
): MonthlyComparisonView {
  const currentMetrics = toMetrics(current);
  const previousMetrics = toMetrics(previous);

  return {
    current: currentMetrics,
    previous: previousMetrics,
    comparison: {
      income: compare(cents(currentMetrics.income), cents(previousMetrics.income)),
      expense: compare(cents(currentMetrics.expense), cents(previousMetrics.expense)),
      net: compare(cents(currentMetrics.net), cents(previousMetrics.net)),
    },
  };
}

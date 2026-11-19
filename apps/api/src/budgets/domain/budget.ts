/**
 * Orcamento por categoria.
 *
 * O orcamento guarda apenas o **limite** (`amountLimit`) do periodo; o consumo
 * e uma **leitura derivada** das despesas confirmadas, pelo mesmo motivo das
 * visoes de calendario e alertas: assim o consumo nunca diverge do realizado
 * nem exige um job de reconciliacao.
 *
 * As somas sao feitas em centavos (inteiros) pela razao habitual do dominio: a
 * representacao binaria de decimais nao e confiavel para dinheiro.
 */

/** A partir deste percentual de consumo o orcamento entra em atencao. */
export const BUDGET_WARNING_THRESHOLD = 0.8;

/** Situacao do consumo frente ao limite. */
export type BudgetStatus = 'ok' | 'warning' | 'exceeded';

/** Orcamento ja normalizado pelo chamador, pronto para o calculo. */
export interface BudgetInput {
  id: string;
  categoryId: string | null;
  categoryName: string | null;
  periodStart: string;
  periodEnd: string;
  amountLimit: string;
}

export interface BudgetProgressView {
  id: string;
  categoryId: string | null;
  categoryName: string | null;
  periodStart: string;
  periodEnd: string;
  amountLimit: string;
  spentAmount: string;
  remainingAmount: string;
  usagePercent: number;
  status: BudgetStatus;
}

export interface BudgetsView {
  periodStart: string;
  periodEnd: string;
  items: BudgetProgressView[];
  totals: {
    amountLimit: string;
    spentAmount: string;
    remainingAmount: string;
  };
}

const cents = (amount: string | number): number => Math.round(Number(amount) * 100);
const toAmount = (value: number): string => (value / 100).toFixed(2);
const iso = (date: Date): string => date.toISOString().slice(0, 10);

/** Mes corrente (1o ao ultimo dia) em UTC; janela padrao do orcamento. */
export function currentMonthRange(today: Date = new Date()): { from: string; to: string } {
  const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const last = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0));
  return { from: iso(first), to: iso(last) };
}

/** Classifica o consumo: estourado, em atencao (>= 80%) ou dentro do limite. */
export function classifyBudget(limitCents: number, spentCents: number): BudgetStatus {
  if (spentCents > limitCents) return 'exceeded';
  if (limitCents > 0 && spentCents >= limitCents * BUDGET_WARNING_THRESHOLD) return 'warning';
  return 'ok';
}

/** Monta a leitura de um orcamento a partir do limite e do consumo realizado. */
export function buildBudgetProgress(input: BudgetInput, spentCents: number): BudgetProgressView {
  const limit = cents(input.amountLimit);
  return {
    id: input.id,
    categoryId: input.categoryId,
    categoryName: input.categoryName,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    amountLimit: toAmount(limit),
    spentAmount: toAmount(spentCents),
    remainingAmount: toAmount(limit - spentCents),
    usagePercent: limit > 0 ? Number(((spentCents / limit) * 100).toFixed(1)) : spentCents > 0 ? 100 : 0,
    status: classifyBudget(limit, spentCents),
  };
}

/** Reune os orcamentos do periodo com seus consumos e os totais do periodo. */
export function buildBudgetsView(
  period: { from: string; to: string },
  entries: Array<{ budget: BudgetInput; spentCents: number }>,
): BudgetsView {
  const items = entries.map((entry) => buildBudgetProgress(entry.budget, entry.spentCents));
  const totalLimit = items.reduce((acc, item) => acc + cents(item.amountLimit), 0);
  const totalSpent = items.reduce((acc, item) => acc + cents(item.spentAmount), 0);

  return {
    periodStart: period.from,
    periodEnd: period.to,
    items,
    totals: {
      amountLimit: toAmount(totalLimit),
      spentAmount: toAmount(totalSpent),
      remainingAmount: toAmount(totalLimit - totalSpent),
    },
  };
}

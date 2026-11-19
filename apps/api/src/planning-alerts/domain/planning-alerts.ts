/**
 * Alertas de planejamento (Fase 3).
 *
 * Como o calendario, os alertas de vencimento e a projecao, e uma **leitura
 * derivada**: nada e gravado e nenhum job e necessario. A funcao pura apenas
 * reune, em uma so visao, os sinais de que algo precisa de atencao *antes* de
 * acontecer — orcamentos ja em atencao/estourados e o aviso de saldo projetado
 * negativo.
 *
 * Os insumos ja chegam calculados pelos dominios de orcamento e de projecao: a
 * funcao nao le banco nem recalcula consumo, so filtra, ordena e conta.
 */

/** Orcamento ja normalizado (mesma forma de `BudgetProgressView`). */
export interface PlanningBudgetInput {
  id: string;
  categoryId: string | null;
  categoryName: string | null;
  periodStart: string;
  periodEnd: string;
  amountLimit: string;
  spentAmount: string;
  remainingAmount: string;
  usagePercent: number;
  status: 'ok' | 'warning' | 'exceeded';
}

/** Recorte do saldo projetado que interessa ao alerta. */
export interface PlanningProjectionInput {
  willGoNegative: boolean;
  minBalance: string;
  minBalanceDate: string;
}

export interface BudgetAlertView {
  budgetId: string;
  categoryId: string | null;
  categoryName: string | null;
  periodStart: string;
  periodEnd: string;
  amountLimit: string;
  spentAmount: string;
  remainingAmount: string;
  usagePercent: number;
  status: 'warning' | 'exceeded';
}

export interface PlanningAlertsView {
  today: string;
  horizonDays: number;
  counts: { budgets: number; negativeBalance: number; total: number };
  negativeBalance: { minBalance: string; minBalanceDate: string } | null;
  budgetAlerts: BudgetAlertView[];
}

/** Criticidade: estourado vem antes de em atencao. */
const STATUS_RANK: Record<'warning' | 'exceeded', number> = { exceeded: 0, warning: 1 };

/**
 * Reune os orcamentos em atencao/estourados e o aviso de saldo negativo.
 *
 * Orcamentos dentro do limite (`ok`) nao geram alerta. Os alertas de orcamento
 * sao ordenados do mais critico ao menos (estourado antes de em atencao; depois
 * o maior percentual consumido).
 */
export function buildPlanningAlerts(input: {
  budgets: PlanningBudgetInput[];
  projection: PlanningProjectionInput;
  horizonDays: number;
  today?: Date;
}): PlanningAlertsView {
  const today = (input.today ?? new Date()).toISOString().slice(0, 10);

  const budgetAlerts: BudgetAlertView[] = input.budgets
    .filter((budget) => budget.status !== 'ok')
    .map((budget) => ({
      budgetId: budget.id,
      categoryId: budget.categoryId,
      categoryName: budget.categoryName,
      periodStart: budget.periodStart,
      periodEnd: budget.periodEnd,
      amountLimit: budget.amountLimit,
      spentAmount: budget.spentAmount,
      remainingAmount: budget.remainingAmount,
      usagePercent: budget.usagePercent,
      status: budget.status as 'warning' | 'exceeded',
    }))
    .sort((a, b) => {
      if (a.status !== b.status) return STATUS_RANK[a.status] - STATUS_RANK[b.status];
      if (b.usagePercent !== a.usagePercent) return b.usagePercent - a.usagePercent;
      return (a.categoryName ?? '').localeCompare(b.categoryName ?? '');
    });

  const negativeBalance = input.projection.willGoNegative
    ? {
        minBalance: input.projection.minBalance,
        minBalanceDate: input.projection.minBalanceDate,
      }
    : null;

  return {
    today,
    horizonDays: input.horizonDays,
    counts: {
      budgets: budgetAlerts.length,
      negativeBalance: negativeBalance ? 1 : 0,
      total: budgetAlerts.length + (negativeBalance ? 1 : 0),
    },
    negativeBalance,
    budgetAlerts,
  };
}

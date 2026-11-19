/**
 * Meta financeira e suas contribuicoes.
 *
 * Diferente do orcamento (consumo derivado) e do calendario (leitura pura), a
 * meta persiste o proprio acumulado (`Goal.currentAmount`): a contribuicao e um
 * incremento explicito do acumulado, nao um recorte do realizado. A situacao
 * (`active`/`achieved`/`overdue`) continua sendo derivada na leitura, para
 * nunca divergir do acumulado.
 *
 * As somas sao feitas em centavos (inteiros) pela razao habitual do dominio: a
 * representacao binaria de decimais nao e confiavel para dinheiro.
 */

/** Situacao da meta frente ao alvo e ao prazo. */
export type GoalStatus = 'active' | 'achieved' | 'overdue';

/** Meta ja normalizada pelo chamador, pronta para o calculo. */
export interface GoalInput {
  id: string;
  name: string;
  targetAmount: string;
  currentAmount: string;
  deadline: string | null;
  color: string | null;
  icon: string | null;
  state: 'active' | 'archived';
}

export interface GoalProgressView {
  id: string;
  name: string;
  targetAmount: string;
  currentAmount: string;
  remainingAmount: string;
  progressPercent: number;
  deadline: string | null;
  overdue: boolean;
  status: GoalStatus;
  state: 'active' | 'archived';
  color: string | null;
  icon: string | null;
}

export interface GoalsView {
  today: string;
  items: GoalProgressView[];
  totals: {
    targetAmount: string;
    currentAmount: string;
    remainingAmount: string;
  };
}

const cents = (amount: string | number): number => Math.round(Number(amount) * 100);
const toAmount = (value: number): string => (value / 100).toFixed(2);
const iso = (date: Date): string => date.toISOString().slice(0, 10);

/** Data de hoje (UTC) no formato `YYYY-MM-DD`. */
export function todayIso(now: Date = new Date()): string {
  return iso(now);
}

/**
 * Classifica a meta: atingida (acumulado >= alvo), atrasada (nao atingida e
 * prazo ja vencido) ou em andamento.
 */
export function classifyGoal(
  targetCents: number,
  currentCents: number,
  deadline: string | null,
  today: string,
): GoalStatus {
  if (targetCents > 0 && currentCents >= targetCents) return 'achieved';
  if (deadline !== null && deadline < today) return 'overdue';
  return 'active';
}

/** Monta a leitura de uma meta a partir do alvo, do acumulado e do prazo. */
export function buildGoalProgress(input: GoalInput, today: string): GoalProgressView {
  const target = cents(input.targetAmount);
  const current = cents(input.currentAmount);
  const status = classifyGoal(target, current, input.deadline, today);

  return {
    id: input.id,
    name: input.name,
    targetAmount: toAmount(target),
    currentAmount: toAmount(current),
    remainingAmount: toAmount(target - current),
    progressPercent: target > 0 ? Number(((current / target) * 100).toFixed(1)) : 0,
    deadline: input.deadline,
    overdue: status === 'overdue',
    status,
    state: input.state,
    color: input.color,
    icon: input.icon,
  };
}

/** Reune as metas com seus progressos e os totais do espaco. */
export function buildGoalsView(today: string, goals: GoalInput[]): GoalsView {
  const items = goals.map((goal) => buildGoalProgress(goal, today));
  const totalTarget = items.reduce((acc, item) => acc + cents(item.targetAmount), 0);
  const totalCurrent = items.reduce((acc, item) => acc + cents(item.currentAmount), 0);

  return {
    today,
    items,
    totals: {
      targetAmount: toAmount(totalTarget),
      currentAmount: toAmount(totalCurrent),
      remainingAmount: toAmount(totalTarget - totalCurrent),
    },
  };
}

/**
 * Cenario simples (Fase 3).
 *
 * Como a projecao e os alertas, e uma **leitura derivada**: nada e gravado e
 * nenhum job e necessario. A ideia e permitir responder "e se...?" somando
 * movimentos **hipoteticos** ao saldo projetado e mostrando o impacto, sem
 * tocar no historico nem nos compromissos reais.
 *
 * A funcao recebe os mesmos insumos da projecao (saldo de partida + compromissos
 * em aberto) e devolve duas leituras: a **real** (so os compromissos) e a do
 * **cenario** (compromissos + ajustes). As somas sao feitas em centavos e as
 * datas comparadas apenas pelo dia (UTC), como no restante do dominio.
 */
import { buildProjection, type BalanceProjectionView } from '../../obligations/domain/projection';
import type { CalendarEntryInput } from '../../obligations/domain/calendar';

/** Movimento hipotetico informado pelo usuario. */
export interface ScenarioAdjustmentInput {
  description: string;
  type: 'income' | 'expense';
  amount: string;
  date: string;
}

export interface ScenarioImpactView {
  closingBalanceDelta: string;
  minBalanceDelta: string;
  willGoNegative: boolean;
  turnsNegative: boolean;
  improves: boolean;
}

export interface ScenarioView {
  base: BalanceProjectionView;
  scenario: BalanceProjectionView;
  adjustments: ScenarioAdjustmentInput[];
  impact: ScenarioImpactView;
}

const cents = (value: string): number => Math.round(Number(value) * 100);
const amount = (value: number): string => (value / 100).toFixed(2);

/**
 * Simula ajustes hipoteticos sobre o saldo projetado.
 *
 * Os ajustes entram como compromissos `pending` (em aberto) na data informada,
 * de modo que a projecao os trata exatamente como um compromisso real: somando
 * pelo dia do vencimento e recortando pelo horizonte. Datas ja passadas sao
 * jogadas para hoje, como no dominio de projecao.
 */
export function buildScenario(
  entries: CalendarEntryInput[],
  options: {
    openingBalance: string;
    adjustments: ScenarioAdjustmentInput[];
    today?: Date;
    horizonDays?: number;
  },
): ScenarioView {
  const horizonDays = options.horizonDays;
  const today = options.today;

  const base = buildProjection(entries, { openingBalance: options.openingBalance, today, horizonDays });

  const hypothetical: CalendarEntryInput[] = options.adjustments.map((adjustment, index) => ({
    kind: 'obligation',
    id: `scenario-${index}`,
    description: adjustment.description,
    type: adjustment.type,
    amount: adjustment.amount,
    status: 'pending',
    overdue: false,
    dueDate: adjustment.date,
  }));

  const scenario = buildProjection([...entries, ...hypothetical], {
    openingBalance: options.openingBalance,
    today,
    horizonDays,
  });

  const closingDelta = cents(scenario.closingBalance) - cents(base.closingBalance);
  const minDelta = cents(scenario.minBalance) - cents(base.minBalance);

  return {
    base,
    scenario,
    adjustments: options.adjustments.map((adjustment) => ({ ...adjustment })),
    impact: {
      closingBalanceDelta: amount(closingDelta),
      minBalanceDelta: amount(minDelta),
      willGoNegative: scenario.willGoNegative,
      turnsNegative: scenario.willGoNegative && !base.willGoNegative,
      improves: closingDelta > 0,
    },
  };
}

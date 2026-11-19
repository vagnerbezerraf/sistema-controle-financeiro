import { describe, expect, it } from 'vitest';
import { buildScenario, type ScenarioAdjustmentInput } from './scenario';
import type { CalendarEntryInput } from '../../obligations/domain/calendar';

const entrada = (over: Partial<CalendarEntryInput> = {}): CalendarEntryInput => ({
  kind: 'obligation',
  id: 'o1',
  description: 'Conta',
  type: 'expense',
  amount: '100.00',
  status: 'pending',
  overdue: false,
  dueDate: '2026-06-20',
  ...over,
});

const ajuste = (over: Partial<ScenarioAdjustmentInput> = {}): ScenarioAdjustmentInput => ({
  description: 'Ajuste',
  type: 'expense',
  amount: '100.00',
  date: '2026-06-20',
  ...over,
});

const hoje = new Date('2026-06-15T12:00:00Z');

describe('scenario', () => {
  it('sem ajustes o cenario coincide com o real', () => {
    const view = buildScenario([entrada({ amount: '200.00' })], {
      openingBalance: '1000.00',
      adjustments: [],
      today: hoje,
    });

    expect(view.scenario).toEqual(view.base);
    expect(view.impact.closingBalanceDelta).toBe('0.00');
    expect(view.impact.minBalanceDelta).toBe('0.00');
    expect(view.impact.willGoNegative).toBe(false);
    expect(view.impact.turnsNegative).toBe(false);
    expect(view.impact.improves).toBe(false);
  });

  it('uma despesa hipotetica reduz o saldo final e o pior momento', () => {
    const view = buildScenario([], {
      openingBalance: '1000.00',
      adjustments: [ajuste({ type: 'expense', amount: '300.00' })],
      today: hoje,
    });

    expect(view.base.closingBalance).toBe('1000.00');
    expect(view.scenario.closingBalance).toBe('700.00');
    expect(view.impact.closingBalanceDelta).toBe('-300.00');
    expect(view.impact.minBalanceDelta).toBe('-300.00');
    expect(view.impact.improves).toBe(false);
    expect(view.impact.turnsNegative).toBe(false);
  });

  it('uma receita hipotetica melhora o saldo', () => {
    const view = buildScenario([], {
      openingBalance: '1000.00',
      adjustments: [ajuste({ type: 'income', amount: '500.00' })],
      today: hoje,
    });

    expect(view.scenario.closingBalance).toBe('1500.00');
    expect(view.impact.closingBalanceDelta).toBe('500.00');
    // O pior momento nao muda: a receita entra depois do saldo de partida.
    expect(view.impact.minBalanceDelta).toBe('0.00');
    expect(view.impact.improves).toBe(true);
  });

  it('sinaliza que o cenario passa a ficar negativo', () => {
    const view = buildScenario([], {
      openingBalance: '1000.00',
      adjustments: [ajuste({ type: 'expense', amount: '1500.00', date: '2026-06-18' })],
      today: hoje,
    });

    expect(view.base.willGoNegative).toBe(false);
    expect(view.scenario.willGoNegative).toBe(true);
    expect(view.impact.turnsNegative).toBe(true);
    expect(view.scenario.minBalance).toBe('-500.00');
    expect(view.scenario.minBalanceDate).toBe('2026-06-18');
  });

  it('nao marca turnsNegative quando o real ja era negativo', () => {
    const view = buildScenario([entrada({ amount: '1500.00' })], {
      openingBalance: '1000.00',
      adjustments: [ajuste({ type: 'expense', amount: '100.00', date: '2026-06-25' })],
      today: hoje,
    });

    expect(view.base.willGoNegative).toBe(true);
    expect(view.scenario.willGoNegative).toBe(true);
    expect(view.impact.turnsNegative).toBe(false);
    expect(view.scenario.minBalance).toBe('-600.00');
  });

  it('combina varios ajustes no mesmo dia', () => {
    const view = buildScenario([], {
      openingBalance: '1000.00',
      adjustments: [
        ajuste({ type: 'income', amount: '200.00', date: '2026-06-20' }),
        ajuste({ type: 'expense', amount: '500.00', date: '2026-06-20' }),
      ],
      today: hoje,
    });

    expect(view.scenario.points).toEqual([
      { date: '2026-06-20', inflow: '200.00', outflow: '500.00', net: '-300.00', balance: '700.00' },
    ]);
    expect(view.impact.closingBalanceDelta).toBe('-300.00');
  });

  it('joga a data passada do ajuste no dia de hoje', () => {
    const view = buildScenario([], {
      openingBalance: '1000.00',
      adjustments: [ajuste({ amount: '250.00', date: '2026-06-01' })],
      today: hoje,
    });

    expect(view.scenario.points).toEqual([
      { date: '2026-06-15', inflow: '0.00', outflow: '250.00', net: '-250.00', balance: '750.00' },
    ]);
  });

  it('devolve os ajustes informados sem alterar o historico', () => {
    const adjustments = [ajuste({ description: 'Comprar notebook', amount: '4500.00' })];
    const view = buildScenario([entrada({ amount: '200.00' })], {
      openingBalance: '1000.00',
      adjustments,
      today: hoje,
    });

    expect(view.adjustments).toEqual(adjustments);
    // A projecao real nao muda por causa do cenario.
    expect(view.base.closingBalance).toBe('800.00');
  });
});

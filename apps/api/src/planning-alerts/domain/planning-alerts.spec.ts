import { describe, expect, it } from 'vitest';
import {
  buildPlanningAlerts,
  type PlanningBudgetInput,
  type PlanningProjectionInput,
} from './planning-alerts';

const orcamento = (over: Partial<PlanningBudgetInput> = {}): PlanningBudgetInput => ({
  id: 'b1',
  categoryId: 'c1',
  categoryName: 'Alimentacao',
  periodStart: '2026-06-01',
  periodEnd: '2026-06-30',
  amountLimit: '1000.00',
  spentAmount: '850.00',
  remainingAmount: '150.00',
  usagePercent: 85,
  status: 'warning',
  ...over,
});

const projecao = (over: Partial<PlanningProjectionInput> = {}): PlanningProjectionInput => ({
  willGoNegative: false,
  minBalance: '500.00',
  minBalanceDate: '2026-06-10',
  ...over,
});

describe('planning-alerts', () => {
  it('nao gera alerta quando nao ha orcamentos nem saldo negativo', () => {
    const view = buildPlanningAlerts({
      budgets: [],
      projection: projecao(),
      horizonDays: 30,
      today: new Date('2026-06-05T12:00:00Z'),
    });

    expect(view.today).toBe('2026-06-05');
    expect(view.horizonDays).toBe(30);
    expect(view.budgetAlerts).toEqual([]);
    expect(view.negativeBalance).toBeNull();
    expect(view.counts).toEqual({ budgets: 0, negativeBalance: 0, total: 0 });
  });

  it('ignora os orcamentos dentro do limite', () => {
    const view = buildPlanningAlerts({
      budgets: [orcamento({ status: 'ok', usagePercent: 40 })],
      projection: projecao(),
      horizonDays: 30,
    });

    expect(view.budgetAlerts).toEqual([]);
    expect(view.counts.budgets).toBe(0);
  });

  it('transforma um orcamento em atencao em alerta', () => {
    const view = buildPlanningAlerts({
      budgets: [orcamento({ status: 'warning', usagePercent: 85 })],
      projection: projecao(),
      horizonDays: 30,
    });

    expect(view.budgetAlerts).toEqual([
      {
        budgetId: 'b1',
        categoryId: 'c1',
        categoryName: 'Alimentacao',
        periodStart: '2026-06-01',
        periodEnd: '2026-06-30',
        amountLimit: '1000.00',
        spentAmount: '850.00',
        remainingAmount: '150.00',
        usagePercent: 85,
        status: 'warning',
      },
    ]);
    expect(view.counts.budgets).toBe(1);
  });

  it('ordena estourado antes de em atencao e, no empate, pelo maior consumo', () => {
    const view = buildPlanningAlerts({
      budgets: [
        orcamento({ id: 'w-baixo', categoryName: 'Lazer', status: 'warning', usagePercent: 82 }),
        orcamento({ id: 'estourado', categoryName: 'Transporte', status: 'exceeded', usagePercent: 120 }),
        orcamento({ id: 'w-alto', categoryName: 'Casa', status: 'warning', usagePercent: 95 }),
      ],
      projection: projecao(),
      horizonDays: 30,
    });

    expect(view.budgetAlerts.map((a) => a.budgetId)).toEqual(['estourado', 'w-alto', 'w-baixo']);
  });

  it('sinaliza o saldo negativo com a menor data e valor', () => {
    const view = buildPlanningAlerts({
      budgets: [],
      projection: projecao({
        willGoNegative: true,
        minBalance: '-300.00',
        minBalanceDate: '2026-06-20',
      }),
      horizonDays: 30,
    });

    expect(view.negativeBalance).toEqual({ minBalance: '-300.00', minBalanceDate: '2026-06-20' });
    expect(view.counts).toEqual({ budgets: 0, negativeBalance: 1, total: 1 });
  });

  it('soma orcamentos e saldo negativo no total', () => {
    const view = buildPlanningAlerts({
      budgets: [
        orcamento({ id: 'b1', status: 'warning' }),
        orcamento({ id: 'b2', status: 'exceeded' }),
      ],
      projection: projecao({ willGoNegative: true, minBalance: '-50.00', minBalanceDate: '2026-06-15' }),
      horizonDays: 15,
    });

    expect(view.horizonDays).toBe(15);
    expect(view.counts).toEqual({ budgets: 2, negativeBalance: 1, total: 3 });
  });

  it('preserva o orcamento geral (sem categoria)', () => {
    const view = buildPlanningAlerts({
      budgets: [orcamento({ id: 'geral', categoryId: null, categoryName: null, status: 'exceeded' })],
      projection: projecao(),
      horizonDays: 30,
    });

    expect(view.budgetAlerts[0]).toMatchObject({ budgetId: 'geral', categoryId: null, categoryName: null });
  });
});

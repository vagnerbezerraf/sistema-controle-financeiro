import { describe, expect, it } from 'vitest';
import {
  BUDGET_WARNING_THRESHOLD,
  buildBudgetProgress,
  buildBudgetsView,
  classifyBudget,
  currentMonthRange,
  type BudgetInput,
} from './budget';

const orcamento = (over: Partial<BudgetInput> = {}): BudgetInput => ({
  id: 'b1',
  categoryId: 'c1',
  categoryName: 'Alimentacao',
  periodStart: '2026-06-01',
  periodEnd: '2026-06-30',
  amountLimit: '1000.00',
  ...over,
});

describe('budget', () => {
  describe('currentMonthRange', () => {
    it('devolve o primeiro e o ultimo dia do mes em UTC', () => {
      expect(currentMonthRange(new Date('2026-06-15T12:00:00Z'))).toEqual({
        from: '2026-06-01',
        to: '2026-06-30',
      });
    });

    it('respeita fevereiro bissexto', () => {
      expect(currentMonthRange(new Date('2028-02-10T00:00:00Z'))).toEqual({
        from: '2028-02-01',
        to: '2028-02-29',
      });
    });
  });

  describe('classifyBudget', () => {
    it('esta dentro do limite quando o consumo e baixo', () => {
      expect(classifyBudget(100_000, 0)).toBe('ok');
      expect(classifyBudget(100_000, 50_000)).toBe('ok');
    });

    it('entra em atencao a partir de 80% do limite', () => {
      expect(BUDGET_WARNING_THRESHOLD).toBe(0.8);
      expect(classifyBudget(100_000, 79_999)).toBe('ok');
      expect(classifyBudget(100_000, 80_000)).toBe('warning');
      expect(classifyBudget(100_000, 99_999)).toBe('warning');
    });

    it('estoura quando o consumo passa do limite', () => {
      expect(classifyBudget(100_000, 100_000)).toBe('warning');
      expect(classifyBudget(100_000, 100_001)).toBe('exceeded');
    });

    it('trata o limite zerado como estourado quando ha consumo', () => {
      expect(classifyBudget(0, 0)).toBe('ok');
      expect(classifyBudget(0, 1)).toBe('exceeded');
    });
  });

  describe('buildBudgetProgress', () => {
    it('calcula consumo, saldo e percentual', () => {
      const view = buildBudgetProgress(orcamento(), 25_000);
      expect(view.amountLimit).toBe('1000.00');
      expect(view.spentAmount).toBe('250.00');
      expect(view.remainingAmount).toBe('750.00');
      expect(view.usagePercent).toBe(25);
      expect(view.status).toBe('ok');
    });

    it('marca atencao e percentual alto ao chegar em 80%', () => {
      const view = buildBudgetProgress(orcamento(), 80_000);
      expect(view.usagePercent).toBe(80);
      expect(view.status).toBe('warning');
      expect(view.remainingAmount).toBe('200.00');
    });

    it('deixa o saldo negativo e passa de 100% quando estoura', () => {
      const view = buildBudgetProgress(orcamento(), 105_000);
      expect(view.spentAmount).toBe('1050.00');
      expect(view.remainingAmount).toBe('-50.00');
      expect(view.usagePercent).toBe(105);
      expect(view.status).toBe('exceeded');
    });

    it('preserva o orcamento geral (sem categoria)', () => {
      const view = buildBudgetProgress(orcamento({ categoryId: null, categoryName: null }), 10_000);
      expect(view.categoryId).toBeNull();
      expect(view.categoryName).toBeNull();
    });
  });

  describe('buildBudgetsView', () => {
    it('soma os totais do periodo e normaliza as casas decimais', () => {
      const view = buildBudgetsView(
        { from: '2026-06-01', to: '2026-06-30' },
        [
          { budget: orcamento({ id: 'b1', amountLimit: '600.00' }), spentCents: 30_000 },
          { budget: orcamento({ id: 'b2', categoryId: null, categoryName: null, amountLimit: '400.01' }), spentCents: 12_050 },
        ],
      );

      expect(view.periodStart).toBe('2026-06-01');
      expect(view.periodEnd).toBe('2026-06-30');
      expect(view.items).toHaveLength(2);
      expect(view.totals).toEqual({
        amountLimit: '1000.01',
        spentAmount: '420.50',
        remainingAmount: '579.51',
      });
    });

    it('devolve totais zerados sem orcamentos', () => {
      const view = buildBudgetsView({ from: '2026-06-01', to: '2026-06-30' }, []);
      expect(view.items).toEqual([]);
      expect(view.totals).toEqual({ amountLimit: '0.00', spentAmount: '0.00', remainingAmount: '0.00' });
    });
  });
});

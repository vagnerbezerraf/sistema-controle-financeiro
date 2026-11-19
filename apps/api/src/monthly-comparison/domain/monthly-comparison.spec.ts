import { describe, expect, it } from 'vitest';
import {
  buildMonthlyComparison,
  monthRange,
  previousMonth,
  type MonthlyTotalsInput,
} from './monthly-comparison';

const mes = (over: Partial<MonthlyTotalsInput> = {}): MonthlyTotalsInput => ({
  month: '2026-06',
  periodStart: '2026-06-01',
  periodEnd: '2026-06-30',
  income: '1000.00',
  expense: '600.00',
  ...over,
});

describe('monthly-comparison', () => {
  it('calcula a janela do mes (inclusive fevereiro bissexto)', () => {
    expect(monthRange('2026-06')).toEqual({ from: '2026-06-01', to: '2026-06-30' });
    expect(monthRange('2024-02')).toEqual({ from: '2024-02-01', to: '2024-02-29' });
    expect(monthRange('2025-02')).toEqual({ from: '2025-02-01', to: '2025-02-28' });
  });

  it('resolve o mes anterior, inclusive atravessando o ano', () => {
    expect(previousMonth('2026-06')).toBe('2026-05');
    expect(previousMonth('2026-01')).toBe('2025-12');
    expect(previousMonth('2026-03')).toBe('2026-02');
  });

  it('compara receitas, despesas e liquido com a variacao absoluta e percentual', () => {
    const view = buildMonthlyComparison(
      mes({ income: '1200.00', expense: '900.00' }),
      mes({ income: '1000.00', expense: '600.00' }),
    );

    expect(view.current).toEqual({
      month: '2026-06',
      periodStart: '2026-06-01',
      periodEnd: '2026-06-30',
      income: '1200.00',
      expense: '900.00',
      net: '300.00',
    });
    expect(view.previous.net).toBe('400.00');

    expect(view.comparison.income).toEqual({
      current: '1200.00',
      previous: '1000.00',
      delta: '200.00',
      deltaPercent: 20,
    });
    expect(view.comparison.expense).toEqual({
      current: '900.00',
      previous: '600.00',
      delta: '300.00',
      deltaPercent: 50,
    });
    expect(view.comparison.net).toEqual({
      current: '300.00',
      previous: '400.00',
      delta: '-100.00',
      deltaPercent: -25,
    });
  });

  it('devolve percentual nulo quando o mes anterior e zero', () => {
    const view = buildMonthlyComparison(
      mes({ income: '500.00' }),
      mes({ income: '0.00' }),
    );

    expect(view.comparison.income.delta).toBe('500.00');
    expect(view.comparison.income.deltaPercent).toBeNull();
  });

  it('trata a reducao a zero como variacao negativa de 100%', () => {
    const view = buildMonthlyComparison(
      mes({ expense: '0.00' }),
      mes({ expense: '400.00' }),
    );

    expect(view.comparison.expense.delta).toBe('-400.00');
    expect(view.comparison.expense.deltaPercent).toBe(-100);
  });

  it('arredonda o percentual em uma casa', () => {
    const view = buildMonthlyComparison(
      mes({ income: '1033.00' }),
      mes({ income: '1000.00' }),
    );

    expect(view.comparison.income.deltaPercent).toBe(3.3);
  });

  it('mantem os totais zerados quando os dois meses nao tem movimento', () => {
    const view = buildMonthlyComparison(
      mes({ income: '0.00', expense: '0.00' }),
      mes({ income: '0.00', expense: '0.00' }),
    );

    expect(view.comparison.income.delta).toBe('0.00');
    expect(view.comparison.income.deltaPercent).toBeNull();
    expect(view.comparison.net.current).toBe('0.00');
  });
});

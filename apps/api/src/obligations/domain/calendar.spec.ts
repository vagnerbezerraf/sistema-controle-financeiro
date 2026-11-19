import { describe, expect, it } from 'vitest';
import { buildCalendar, defaultMonthRange, type CalendarEntryInput } from './calendar';

const entrada = (over: Partial<CalendarEntryInput>): CalendarEntryInput => ({
  kind: 'obligation',
  id: 'o1',
  description: 'Conta',
  type: 'expense',
  amount: '100.00',
  status: 'pending',
  overdue: false,
  dueDate: '2026-06-10',
  ...over,
});

describe('calendar', () => {
  describe('defaultMonthRange', () => {
    it('devolve o primeiro e o ultimo dia do mes em UTC', () => {
      expect(defaultMonthRange(new Date('2026-06-15T12:00:00Z'))).toEqual({
        from: '2026-06-01',
        to: '2026-06-30',
      });
    });

    it('respeita fevereiro bissexto', () => {
      expect(defaultMonthRange(new Date('2028-02-15T00:00:00Z'))).toEqual({
        from: '2028-02-01',
        to: '2028-02-29',
      });
    });
  });

  describe('buildCalendar', () => {
    it('agrupa por dia e soma receitas e despesas em centavos', () => {
      const view = buildCalendar(
        [
          entrada({ id: 'a', dueDate: '2026-06-10', amount: '100.10', type: 'expense' }),
          entrada({ id: 'b', dueDate: '2026-06-10', amount: '0.20', type: 'expense' }),
          entrada({ id: 'c', dueDate: '2026-06-10', amount: '50.00', type: 'income' }),
          entrada({ id: 'd', dueDate: '2026-06-20', amount: '300.00', type: 'income' }),
        ],
        { from: '2026-06-01', to: '2026-06-30' },
      );

      expect(view.days.map((d) => d.date)).toEqual(['2026-06-10', '2026-06-20']);
      expect(view.days[0].expenseTotal).toBe('100.30');
      expect(view.days[0].incomeTotal).toBe('50.00');
      expect(view.days[0].entries).toHaveLength(3);
      expect(view.totals).toEqual({
        income: '350.00',
        expense: '100.30',
        net: '249.70',
        entryCount: 4,
        overdueCount: 0,
      });
    });

    it('descarta as entradas fora da janela do periodo', () => {
      const view = buildCalendar(
        [
          entrada({ id: 'antes', dueDate: '2026-05-31', amount: '10.00' }),
          entrada({ id: 'dentro', dueDate: '2026-06-01', amount: '20.00' }),
          entrada({ id: 'depois', dueDate: '2026-07-01', amount: '30.00' }),
        ],
        { from: '2026-06-01', to: '2026-06-30' },
      );

      expect(view.days).toHaveLength(1);
      expect(view.days[0].entries.map((e) => e.id)).toEqual(['dentro']);
      expect(view.totals.expense).toBe('20.00');
      expect(view.totals.entryCount).toBe(1);
    });

    it('conta as entradas vencidas e calcula o liquido', () => {
      const view = buildCalendar(
        [
          entrada({ id: 'v1', dueDate: '2026-06-05', amount: '80.00', overdue: true }),
          entrada({ id: 'v2', dueDate: '2026-06-05', amount: '20.00', type: 'income', overdue: true }),
          entrada({ id: 'ok', dueDate: '2026-06-25', amount: '200.00', type: 'income' }),
        ],
        { from: '2026-06-01', to: '2026-06-30' },
      );

      expect(view.totals.overdueCount).toBe(2);
      expect(view.totals.net).toBe('140.00');
    });

    it('normaliza a data para o dia (YYYY-MM-DD) e devolve dias vazios como ausentes', () => {
      const view = buildCalendar([entrada({ dueDate: '2026-06-10T00:00:00.000Z' })], {
        from: '2026-06-01',
        to: '2026-06-30',
      });
      expect(view.days[0].date).toBe('2026-06-10');
      expect(view.days[0].entries[0].dueDate).toBe('2026-06-10');
    });

    it('devolve um calendario vazio quando nao ha entradas', () => {
      const view = buildCalendar([], { from: '2026-06-01', to: '2026-06-30' });
      expect(view.days).toEqual([]);
      expect(view.totals).toEqual({
        income: '0.00',
        expense: '0.00',
        net: '0.00',
        entryCount: 0,
        overdueCount: 0,
      });
    });
  });
});

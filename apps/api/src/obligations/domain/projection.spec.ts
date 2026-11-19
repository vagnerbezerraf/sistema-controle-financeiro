import { describe, expect, it } from 'vitest';
import { buildProjection, DEFAULT_PROJECTION_HORIZON_DAYS } from './projection';
import type { CalendarEntryInput } from './calendar';

const entrada = (over: Partial<CalendarEntryInput>): CalendarEntryInput => ({
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

const hoje = new Date('2026-06-15T12:00:00Z');

describe('projection', () => {
  it('usa o horizonte padrao de 30 dias', () => {
    expect(DEFAULT_PROJECTION_HORIZON_DAYS).toBe(30);
  });

  it('sem compromissos o saldo nao muda', () => {
    const view = buildProjection([], { openingBalance: '1000.00', today: hoje });
    expect(view.today).toBe('2026-06-15');
    expect(view.openingBalance).toBe('1000.00');
    expect(view.closingBalance).toBe('1000.00');
    expect(view.minBalance).toBe('1000.00');
    expect(view.minBalanceDate).toBe('2026-06-15');
    expect(view.willGoNegative).toBe(false);
    expect(view.points).toEqual([]);
    expect(view.upcomingCount).toBe(0);
    expect(view.upcomingAmount).toBe('0.00');
  });

  it('caminha o saldo somando receitas e despesas por dia', () => {
    const view = buildProjection(
      [
        entrada({ id: 'salario', type: 'income', amount: '3000.00', dueDate: '2026-06-20' }),
        entrada({ id: 'aluguel', type: 'expense', amount: '1800.00', dueDate: '2026-06-25' }),
      ],
      { openingBalance: '500.00', today: hoje },
    );

    expect(view.points).toEqual([
      { date: '2026-06-20', inflow: '3000.00', outflow: '0.00', net: '3000.00', balance: '3500.00' },
      { date: '2026-06-25', inflow: '0.00', outflow: '1800.00', net: '-1800.00', balance: '1700.00' },
    ]);
    expect(view.closingBalance).toBe('1700.00');
    expect(view.upcomingCount).toBe(2);
    expect(view.upcomingAmount).toBe('1800.00');
  });

  it('joga os vencimentos passados no dia de hoje', () => {
    const view = buildProjection(
      [entrada({ id: 'atrasada', amount: '200.00', dueDate: '2026-06-01' })],
      { openingBalance: '1000.00', today: hoje },
    );

    expect(view.points).toEqual([
      { date: '2026-06-15', inflow: '0.00', outflow: '200.00', net: '-200.00', balance: '800.00' },
    ]);
  });

  it('descarta o que esta alem do horizonte', () => {
    const view = buildProjection(
      [
        entrada({ id: 'dentro', amount: '100.00', dueDate: '2026-06-20' }),
        entrada({ id: 'distante', amount: '999.00', dueDate: '2026-08-20' }),
      ],
      { openingBalance: '1000.00', today: hoje, horizonDays: 30 },
    );

    expect(view.points).toHaveLength(1);
    expect(view.points[0].date).toBe('2026-06-20');
    expect(view.closingBalance).toBe('900.00');
  });

  it('ignora entradas cujo status nao esta mais em aberto', () => {
    const view = buildProjection(
      [
        entrada({ id: 'conciliada', status: 'reconciled', amount: '500.00' }),
        entrada({ id: 'cancelada', status: 'canceled', amount: '300.00' }),
        entrada({ id: 'fatura-paga', kind: 'invoice', status: 'paid', amount: '120.00' }),
        entrada({ id: 'aberta', status: 'pending', amount: '100.00' }),
      ],
      { openingBalance: '1000.00', today: hoje },
    );

    expect(view.points).toEqual([
      { date: '2026-06-20', inflow: '0.00', outflow: '100.00', net: '-100.00', balance: '900.00' },
    ]);
    expect(view.upcomingCount).toBe(1);
  });

  it('sinaliza saldo negativo com o menor saldo e seu dia', () => {
    const view = buildProjection(
      [
        entrada({ id: 'conta', amount: '1500.00', dueDate: '2026-06-20' }),
        entrada({ id: 'entrada', type: 'income', amount: '2000.00', dueDate: '2026-06-28' }),
      ],
      { openingBalance: '300.00', today: hoje },
    );

    expect(view.willGoNegative).toBe(true);
    expect(view.minBalance).toBe('-1200.00');
    expect(view.minBalanceDate).toBe('2026-06-20');
    expect(view.closingBalance).toBe('800.00');
  });

  it('mantem todos os saldos positivos quando nao ha estouro', () => {
    const view = buildProjection([entrada({ amount: '150.00' })], {
      openingBalance: '1000.00',
      today: hoje,
    });
    expect(view.willGoNegative).toBe(false);
    expect(view.minBalance).toBe('850.00');
    expect(view.minBalanceDate).toBe('2026-06-20');
  });
});

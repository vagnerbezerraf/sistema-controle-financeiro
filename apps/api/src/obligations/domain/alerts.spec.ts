import { describe, expect, it } from 'vitest';
import { buildAlerts, DEFAULT_ALERT_HORIZON_DAYS } from './alerts';
import type { CalendarEntryInput } from './calendar';

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

const hoje = new Date('2026-06-15T12:00:00Z');

describe('alerts', () => {
  it('usa o horizonte padrao de 7 dias', () => {
    expect(DEFAULT_ALERT_HORIZON_DAYS).toBe(7);
  });

  it('classifica vencidas, de hoje e proximas', () => {
    const view = buildAlerts(
      [
        entrada({ id: 'vencida', dueDate: '2026-06-10' }),
        entrada({ id: 'hoje', dueDate: '2026-06-15' }),
        entrada({ id: 'breve', dueDate: '2026-06-18' }),
      ],
      { today: hoje },
    );

    expect(view.today).toBe('2026-06-15');
    expect(view.counts).toEqual({ overdue: 1, dueToday: 1, dueSoon: 1, total: 3 });
    expect(view.alerts.map((a) => [a.id, a.severity, a.daysUntilDue])).toEqual([
      ['vencida', 'overdue', -5],
      ['hoje', 'due_today', 0],
      ['breve', 'due_soon', 3],
    ]);
  });

  it('marca como vencida (overdue) a entrada em aberto com prazo passado', () => {
    const view = buildAlerts([entrada({ id: 'vencida', dueDate: '2026-06-01' })], { today: hoje });
    expect(view.alerts[0].severity).toBe('overdue');
    expect(view.alerts[0].overdue).toBe(true);
  });

  it('descarta o que esta alem do horizonte', () => {
    const view = buildAlerts(
      [
        entrada({ id: 'breve', dueDate: '2026-06-20' }),
        entrada({ id: 'distante', dueDate: '2026-06-30' }),
      ],
      { today: hoje, horizonDays: 7 },
    );
    expect(view.alerts.map((a) => a.id)).toEqual(['breve']);
    expect(view.counts.total).toBe(1);
  });

  it('com horizonte 0 mantem apenas vencidas e as de hoje', () => {
    const view = buildAlerts(
      [
        entrada({ id: 'vencida', dueDate: '2026-06-14' }),
        entrada({ id: 'hoje', dueDate: '2026-06-15' }),
        entrada({ id: 'amanha', dueDate: '2026-06-16' }),
      ],
      { today: hoje, horizonDays: 0 },
    );
    expect(view.alerts.map((a) => a.id)).toEqual(['vencida', 'hoje']);
  });

  it('ignora obrigacao conciliada (deixou de ser compromisso)', () => {
    const view = buildAlerts(
      [
        entrada({ id: 'paga', dueDate: '2026-06-10', status: 'reconciled' }),
        entrada({ id: 'aberta', dueDate: '2026-06-10' }),
      ],
      { today: hoje },
    );
    expect(view.alerts.map((a) => a.id)).toEqual(['aberta']);
  });

  it('inclui fatura de cartao e ordena do mais urgente ao menos', () => {
    const view = buildAlerts(
      [
        entrada({ id: 'breve', dueDate: '2026-06-19', description: 'Luz' }),
        entrada({ id: 'fatura', kind: 'invoice', dueDate: '2026-06-12', description: 'Fatura Nubank' }),
      ],
      { today: hoje },
    );
    expect(view.alerts.map((a) => a.id)).toEqual(['fatura', 'breve']);
    expect(view.alerts[0].severity).toBe('overdue');
  });

  it('devolve contagens zeradas sem entradas', () => {
    const view = buildAlerts([], { today: hoje });
    expect(view.alerts).toEqual([]);
    expect(view.counts).toEqual({ overdue: 0, dueToday: 0, dueSoon: 0, total: 0 });
  });
});

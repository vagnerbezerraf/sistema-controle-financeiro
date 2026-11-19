import { describe, expect, it } from 'vitest';
import {
  buildGoalProgress,
  buildGoalsView,
  classifyGoal,
  todayIso,
  type GoalInput,
} from './goal';

const goal = (over: Partial<GoalInput> = {}): GoalInput => ({
  id: 'goal-1',
  name: 'Reserva',
  targetAmount: '1000.00',
  currentAmount: '0.00',
  deadline: null,
  color: null,
  icon: null,
  state: 'active',
  ...over,
});

describe('goal · todayIso', () => {
  it('devolve a data UTC no formato YYYY-MM-DD', () => {
    expect(todayIso(new Date('2026-03-09T23:30:00Z'))).toBe('2026-03-09');
  });
});

describe('goal · classifyGoal', () => {
  it('e em andamento quando o acumulado esta abaixo do alvo', () => {
    expect(classifyGoal(100_000, 40_000, null, '2026-06-15')).toBe('active');
  });

  it('e atingida quando o acumulado alcanca o alvo', () => {
    expect(classifyGoal(100_000, 100_000, null, '2026-06-15')).toBe('achieved');
    expect(classifyGoal(100_000, 120_000, null, '2026-06-15')).toBe('achieved');
  });

  it('e atrasada quando o prazo passou e a meta nao foi atingida', () => {
    expect(classifyGoal(100_000, 40_000, '2026-06-14', '2026-06-15')).toBe('overdue');
  });

  it('nao marca atraso quando o prazo e hoje ou futuro', () => {
    expect(classifyGoal(100_000, 40_000, '2026-06-15', '2026-06-15')).toBe('active');
    expect(classifyGoal(100_000, 40_000, '2026-12-31', '2026-06-15')).toBe('active');
  });

  it('prioriza "atingida" mesmo com o prazo vencido', () => {
    expect(classifyGoal(100_000, 100_000, '2026-01-01', '2026-06-15')).toBe('achieved');
  });

  it('trata alvo zero como em andamento (guard contra divisao por zero)', () => {
    expect(classifyGoal(0, 0, null, '2026-06-15')).toBe('active');
  });
});

describe('goal · buildGoalProgress', () => {
  it('calcula alvo, acumulado, saldo e percentual', () => {
    const view = buildGoalProgress(goal({ currentAmount: '250.00' }), '2026-06-15');
    expect(view.targetAmount).toBe('1000.00');
    expect(view.currentAmount).toBe('250.00');
    expect(view.remainingAmount).toBe('750.00');
    expect(view.progressPercent).toBe(25);
    expect(view.status).toBe('active');
    expect(view.overdue).toBe(false);
  });

  it('marca a meta atingida e permite superar o alvo', () => {
    const view = buildGoalProgress(goal({ currentAmount: '1100.00' }), '2026-06-15');
    expect(view.progressPercent).toBe(110);
    expect(view.remainingAmount).toBe('-100.00');
    expect(view.status).toBe('achieved');
  });

  it('sinaliza atraso quando o prazo ja passou', () => {
    const view = buildGoalProgress(goal({ currentAmount: '100.00', deadline: '2026-06-01' }), '2026-06-15');
    expect(view.overdue).toBe(true);
    expect(view.status).toBe('overdue');
    expect(view.deadline).toBe('2026-06-01');
  });

  it('e zero por cento quando ainda nao houve contribuicao', () => {
    const view = buildGoalProgress(goal(), '2026-06-15');
    expect(view.progressPercent).toBe(0);
    expect(view.currentAmount).toBe('0.00');
  });
});

describe('goal · buildGoalsView', () => {
  it('agrega os totais em centavos', () => {
    const view = buildGoalsView('2026-06-15', [
      goal({ id: 'a', targetAmount: '1000.00', currentAmount: '250.00' }),
      goal({ id: 'b', targetAmount: '600.00', currentAmount: '100.00' }),
    ]);

    expect(view.today).toBe('2026-06-15');
    expect(view.items).toHaveLength(2);
    expect(view.totals).toEqual({
      targetAmount: '1600.00',
      currentAmount: '350.00',
      remainingAmount: '1250.00',
    });
  });

  it('devolve totais zerados quando nao ha metas', () => {
    const view = buildGoalsView('2026-06-15', []);
    expect(view.items).toHaveLength(0);
    expect(view.totals).toEqual({
      targetAmount: '0.00',
      currentAmount: '0.00',
      remainingAmount: '0.00',
    });
  });
});

import { describe, expect, it } from 'vitest';
import {
  createRecurrenceProcessor,
  type ForecastRow,
  type RecurrenceRuleRecord,
  type RecurrenceStore,
} from './recurrence';

const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const iso = (date: Date) => date.toISOString().slice(0, 10);

const logger = { info: () => {}, warn: () => {}, error: () => {} };

function regra(over: Partial<RecurrenceRuleRecord> = {}): RecurrenceRuleRecord {
  return {
    id: 'r1',
    financialSpaceId: 's1',
    frequency: 'monthly',
    interval: 1,
    startDate: dia('2026-01-10'),
    endDate: null,
    occurrencesLimit: null,
    state: 'active',
    template: { type: 'expense', description: 'Aluguel', amount: '1500.00' },
    ...over,
  };
}

/** Store em memoria que deduplica por (regra, vencimento), como o banco. */
function makeStore(rules: RecurrenceRuleRecord[]) {
  const gravadas = new Map<string, Set<string>>();
  const push = (rows: ForecastRow[]): number => {
    let count = 0;
    for (const row of rows) {
      const set = gravadas.get(row.recurrenceRuleId) ?? new Set<string>();
      const key = iso(row.dueDate);
      if (!set.has(key)) {
        set.add(key);
        count += 1;
      }
      gravadas.set(row.recurrenceRuleId, set);
    }
    return count;
  };
  const store: RecurrenceStore = {
    findActiveRules: async () => rules.filter((r) => r.state === 'active'),
    findRule: async (id) => rules.find((r) => r.id === id) ?? null,
    createForecasts: async (rows) => push(rows),
  };
  return { store, gravadas };
}

describe('recurrence processor (worker)', () => {
  it('materializa as previsoes das regras ativas ate o horizonte', async () => {
    const { store, gravadas } = makeStore([regra()]);
    const processor = createRecurrenceProcessor({
      store,
      logger,
      now: () => dia('2026-03-15'),
      horizonMonths: 2,
    });

    const result = await processor.generateAll();

    expect(result).toEqual({ rules: 1, plannedCount: 5, generatedCount: 5 });
    expect([...gravadas.get('r1')!].sort()).toEqual([
      '2026-01-10',
      '2026-02-10',
      '2026-03-10',
      '2026-04-10',
      '2026-05-10',
    ]);
  });

  it('e idempotente: reexecutar nao cria previsoes duplicadas', async () => {
    const { store, gravadas } = makeStore([regra()]);
    const processor = createRecurrenceProcessor({
      store,
      logger,
      now: () => dia('2026-03-15'),
      horizonMonths: 2,
    });

    await processor.generateAll();
    const segunda = await processor.generateAll();

    expect(segunda.generatedCount).toBe(0);
    expect(segunda.plannedCount).toBe(5);
    expect(gravadas.get('r1')!.size).toBe(5);
  });

  it('ignora regras arquivadas no ciclo completo', async () => {
    const { store } = makeStore([regra(), regra({ id: 'r2', state: 'archived' })]);
    const processor = createRecurrenceProcessor({
      store,
      logger,
      now: () => dia('2026-03-15'),
      horizonMonths: 2,
    });

    const result = await processor.generateAll();

    expect(result.rules).toBe(1);
    expect(result.generatedCount).toBe(5);
  });

  it('copia o template para a previsao (moeda padrao BRL)', async () => {
    let visto: ForecastRow[] = [];
    const store: RecurrenceStore = {
      findActiveRules: async () => [regra({ template: { type: 'income', description: 'Salario', amount: '8000.00' } })],
      findRule: async () => null,
      createForecasts: async (rows) => {
        visto = rows;
        return rows.length;
      },
    };
    const processor = createRecurrenceProcessor({ store, logger, now: () => dia('2026-01-10'), horizonMonths: 0 });

    await processor.generateAll();

    expect(visto).toHaveLength(1);
    expect(visto[0]).toMatchObject({
      financialSpaceId: 's1',
      recurrenceRuleId: 'r1',
      status: 'forecast',
      type: 'income',
      description: 'Salario',
      amount: '8000.00',
      currency: 'BRL',
    });
    expect(iso(visto[0].dueDate)).toBe('2026-01-10');
  });

  describe('generateRule', () => {
    it('materializa uma regra ate a data informada', async () => {
      const { store } = makeStore([regra()]);
      const processor = createRecurrenceProcessor({ store, logger, now: () => dia('2026-01-01') });

      const result = await processor.generateRule('r1', '2026-04-30');

      expect(result).toEqual({
        handled: true,
        ruleId: 'r1',
        horizon: '2026-04-30',
        plannedCount: 4,
        generatedCount: 4,
      });
    });

    it('recusa job sem ruleId, regra inexistente ou arquivada', async () => {
      const { store } = makeStore([regra({ id: 'r2', state: 'archived' })]);
      const processor = createRecurrenceProcessor({ store, logger, now: () => dia('2026-01-01') });

      expect(await processor.generateRule()).toMatchObject({ handled: false, generatedCount: 0 });
      expect(await processor.generateRule('inexistente')).toMatchObject({ handled: false });
      expect(await processor.generateRule('r2')).toMatchObject({ handled: false });
    });
  });
});

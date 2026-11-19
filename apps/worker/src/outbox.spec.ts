import { describe, expect, it, vi } from 'vitest';
import {
  OUTBOX_FAILED,
  OUTBOX_MAX_ATTEMPTS,
  OUTBOX_PENDING,
  OUTBOX_PUBLISHED,
} from './domain/outbox';
import {
  createOutboxDrainer,
  type OutboxEventRecord,
  type OutboxLogger,
  type OutboxStore,
} from './outbox';

const silencioso: OutboxLogger = { info: () => {}, warn: () => {}, error: () => {} };

const evento = (over: Partial<OutboxEventRecord> & Pick<OutboxEventRecord, 'id'>): OutboxEventRecord => ({
  financialSpaceId: 'space-1',
  eventType: 'recurrence.generated',
  payload: {},
  status: OUTBOX_PENDING,
  attempts: 0,
  nextAttemptAt: null,
  createdAt: new Date('2026-06-15T10:00:00Z'),
  ...over,
});

interface Linha extends OutboxEventRecord {
  publishedAt?: Date;
  lastError?: string | null;
}

/** Store em memoria que espelha o comportamento do store sobre o Prisma. */
function makeStore(seed: OutboxEventRecord[]) {
  const rows = new Map<string, Linha>(seed.map((e) => [e.id, { ...e }]));

  const store: OutboxStore = {
    findPending: async (now, limit) =>
      [...rows.values()]
        .filter(
          (r) =>
            r.status === OUTBOX_PENDING &&
            (!r.nextAttemptAt || r.nextAttemptAt.getTime() <= now.getTime()),
        )
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .slice(0, limit)
        .map((r) => ({ ...r })),

    markPublished: async (id, at) => {
      const row = rows.get(id)!;
      row.status = OUTBOX_PUBLISHED;
      row.publishedAt = at;
      row.lastError = null;
    },
    scheduleRetry: async (id, attempts, next, lastError) => {
      const row = rows.get(id)!;
      row.status = OUTBOX_PENDING;
      row.attempts = attempts;
      row.nextAttemptAt = next;
      row.lastError = lastError;
    },
    markFailed: async (id, attempts, lastError) => {
      const row = rows.get(id)!;
      row.status = OUTBOX_FAILED;
      row.attempts = attempts;
      row.nextAttemptAt = null;
      row.lastError = lastError;
    },
  };

  return { store, rows };
}

const agora = () => new Date('2026-06-15T10:00:00Z');

describe('outbox (drainer)', () => {
  it('publica os eventos prontos e marca como published', async () => {
    const { store, rows } = makeStore([evento({ id: 'a' }), evento({ id: 'b' })]);
    const dispatch = vi.fn();
    const drainer = createOutboxDrainer({ store, dispatch, logger: silencioso, now: agora });

    const result = await drainer.drainOnce();

    expect(result).toEqual({ processed: 2, published: 2, retried: 0, failed: 0 });
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(rows.get('a')!.status).toBe(OUTBOX_PUBLISHED);
    expect(rows.get('a')!.publishedAt?.toISOString()).toBe('2026-06-15T10:00:00.000Z');
  });

  it('ignora eventos ainda nao prontos (nextAttemptAt no futuro)', async () => {
    const { store } = makeStore([
      evento({ id: 'a' }),
      evento({ id: 'b', attempts: 1, nextAttemptAt: new Date('2026-06-15T10:00:05Z') }),
    ]);
    const dispatch = vi.fn();
    const drainer = createOutboxDrainer({ store, dispatch, logger: silencioso, now: agora });

    const result = await drainer.drainOnce();

    expect(result.published).toBe(1);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0][0].id).toBe('a');
  });

  it('reagenda em falha, incrementando as tentativas e aplicando backoff', async () => {
    const { store, rows } = makeStore([evento({ id: 'a' })]);
    const dispatch = vi.fn(() => {
      throw new Error('broker fora do ar');
    });
    const drainer = createOutboxDrainer({ store, dispatch, logger: silencioso, now: agora });

    const result = await drainer.drainOnce();

    expect(result).toEqual({ processed: 1, published: 0, retried: 1, failed: 0 });
    expect(rows.get('a')!.status).toBe(OUTBOX_PENDING);
    expect(rows.get('a')!.attempts).toBe(1);
    expect(rows.get('a')!.nextAttemptAt?.toISOString()).toBe('2026-06-15T10:00:05.000Z');
    expect(rows.get('a')!.lastError).toBe('broker fora do ar');
  });

  it('marca como failed quando as tentativas esgotam', async () => {
    const { store, rows } = makeStore([evento({ id: 'a', attempts: OUTBOX_MAX_ATTEMPTS - 1 })]);
    const dispatch = vi.fn(() => {
      throw new Error('falha persistente');
    });
    const drainer = createOutboxDrainer({ store, dispatch, logger: silencioso, now: agora });

    const result = await drainer.drainOnce();

    expect(result).toEqual({ processed: 1, published: 0, retried: 0, failed: 1 });
    expect(rows.get('a')!.status).toBe(OUTBOX_FAILED);
    expect(rows.get('a')!.attempts).toBe(OUTBOX_MAX_ATTEMPTS);
  });

  it('e idempotente: reexecutar o lote nao republica o que ja saiu', async () => {
    const { store } = makeStore([evento({ id: 'a' })]);
    const dispatch = vi.fn();
    const drainer = createOutboxDrainer({ store, dispatch, logger: silencioso, now: agora });

    await drainer.drainOnce();
    const segundo = await drainer.drainOnce();

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(segundo).toEqual({ processed: 0, published: 0, retried: 0, failed: 0 });
  });

  it('processa no maximo o tamanho do lote por ciclo', async () => {
    const { store } = makeStore([evento({ id: 'a' }), evento({ id: 'b' }), evento({ id: 'c' })]);
    const dispatch = vi.fn();
    const drainer = createOutboxDrainer({ store, dispatch, logger: silencioso, now: agora, limit: 2 });

    expect((await drainer.drainOnce()).published).toBe(2);
    expect((await drainer.drainOnce()).published).toBe(1);
  });
});

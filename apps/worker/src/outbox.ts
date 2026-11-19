/**
 * Drainer do outbox: le os eventos pendentes gravados pela API e os publica.
 *
 * A logica pura de retry/backoff/selecao vive em `domain/outbox.ts`; aqui fica
 * a orquestracao (store + despacho) e a implementacao do store sobre o Prisma.
 * O drainer e testavel sem banco porque o store e injetado.
 */
import type { PrismaClient } from '@prisma/client';
import {
  isExhausted,
  nextAttemptAt,
  OUTBOX_FAILED,
  OUTBOX_PENDING,
  OUTBOX_PUBLISHED,
  selectReadyEvents,
  type OutboxEventLike,
} from './domain/outbox';

/** Evento persistido, com os campos que o despacho consome. */
export interface OutboxEventRecord extends OutboxEventLike {
  financialSpaceId: string;
  eventType: string;
  payload: unknown;
}

/** Abstrai a persistencia do outbox (implementado sobre o Prisma). */
export interface OutboxStore {
  findPending(now: Date, limit: number): Promise<OutboxEventRecord[]>;
  markPublished(id: string, at: Date): Promise<void>;
  scheduleRetry(id: string, attempts: number, nextAttemptAt: Date, lastError: string): Promise<void>;
  markFailed(id: string, attempts: number, lastError: string): Promise<void>;
}

/** Publica um evento (por enquanto apenas registra; ponto de extensao). */
export type OutboxDispatch = (event: OutboxEventRecord) => Promise<void> | void;

/** Logger minimo aceito pelo drainer (compativel com o pino do worker). */
export interface OutboxLogger {
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
  error(obj: Record<string, unknown>, msg: string): void;
}

export interface OutboxDrainResult {
  processed: number;
  published: number;
  retried: number;
  failed: number;
}

export interface OutboxDrainerDeps {
  store: OutboxStore;
  dispatch: OutboxDispatch;
  logger: OutboxLogger;
  /** Injetavel para testes; padrao = relogio do sistema. */
  now?: () => Date;
  /** Tamanho do lote processado por ciclo. */
  limit?: number;
}

export interface OutboxDrainer {
  drainOnce(): Promise<OutboxDrainResult>;
}

export const DEFAULT_OUTBOX_BATCH = 25;

/**
 * Processa um lote de eventos prontos. Cada evento e resolvido de forma
 * independente: sucesso vira `published`; falha reagenda com backoff (ou vira
 * `failed` quando as tentativas esgotam). Reexecutar o lote nao republica nada,
 * pois apenas eventos `pending` sao selecionados.
 */
export function createOutboxDrainer(deps: OutboxDrainerDeps): OutboxDrainer {
  const now = deps.now ?? (() => new Date());
  const limit = deps.limit ?? DEFAULT_OUTBOX_BATCH;

  return {
    async drainOnce(): Promise<OutboxDrainResult> {
      const at = now();
      const pending = await deps.store.findPending(at, limit);
      const ready = selectReadyEvents(pending, at, limit);
      const result: OutboxDrainResult = { processed: 0, published: 0, retried: 0, failed: 0 };

      for (const event of ready) {
        result.processed += 1;
        try {
          await deps.dispatch(event);
          await deps.store.markPublished(event.id, at);
          result.published += 1;
          deps.logger.info({ id: event.id, eventType: event.eventType }, 'Evento do outbox publicado');
        } catch (err) {
          const attempts = event.attempts + 1;
          const lastError = err instanceof Error ? err.message : String(err);
          if (isExhausted(attempts)) {
            await deps.store.markFailed(event.id, attempts, lastError);
            result.failed += 1;
            deps.logger.error({ id: event.id, attempts, lastError }, 'Evento do outbox esgotou as tentativas');
          } else {
            const next = nextAttemptAt(at, attempts);
            await deps.store.scheduleRetry(event.id, attempts, next, lastError);
            result.retried += 1;
            deps.logger.warn(
              { id: event.id, attempts, nextAttemptAt: next.toISOString(), lastError },
              'Reagendando evento do outbox',
            );
          }
        }
      }

      return result;
    },
  };
}

/** Store do outbox sobre o Prisma (mesma tabela que a API grava). */
export function createPrismaOutboxStore(prisma: PrismaClient): OutboxStore {
  return {
    findPending: (now, limit) =>
      prisma.outboxEvent.findMany({
        where: {
          status: OUTBOX_PENDING,
          OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
        },
        orderBy: { createdAt: 'asc' },
        take: limit,
      }),

    markPublished: async (id, at) => {
      await prisma.outboxEvent.update({
        where: { id },
        data: { status: OUTBOX_PUBLISHED, publishedAt: at, lastError: null },
      });
    },

    scheduleRetry: async (id, attempts, next, lastError) => {
      await prisma.outboxEvent.update({
        where: { id },
        data: { status: OUTBOX_PENDING, attempts, nextAttemptAt: next, lastError },
      });
    },

    markFailed: async (id, attempts, lastError) => {
      await prisma.outboxEvent.update({
        where: { id },
        data: { status: OUTBOX_FAILED, attempts, nextAttemptAt: null, lastError },
      });
    },
  };
}

/**
 * Dominio puro do outbox transacional.
 *
 * O padrao outbox grava o evento na MESMA transacao da escrita de negocio (a
 * API faz isso) e deixa um processo de fundo (este worker) publica-lo depois.
 * Aqui ficam apenas as regras de "quando tentar de novo", "quando desistir" e
 * "qual evento esta pronto para publicar" — sem banco e sem relogio global,
 * para serem testaveis de forma deterministica.
 */

/** Situacoes possiveis de um evento do outbox. */
export type OutboxStatus = 'pending' | 'published' | 'failed';

export const OUTBOX_PENDING: OutboxStatus = 'pending';
export const OUTBOX_PUBLISHED: OutboxStatus = 'published';
export const OUTBOX_FAILED: OutboxStatus = 'failed';

/** Depois deste numero de tentativas o evento e considerado "morto". */
export const OUTBOX_MAX_ATTEMPTS = 5;

/** Base do backoff exponencial (5s, 10s, 20s, 40s, 80s...). */
export const OUTBOX_BACKOFF_BASE_MS = 5_000;

/** Teto do backoff, para nao adiar demais um evento recuperavel. */
export const OUTBOX_BACKOFF_MAX_MS = 5 * 60_000;

/**
 * Campos do evento relevantes para o agendamento. Aceita tanto as linhas do
 * Prisma quanto objetos simples, o que mantem o dominio desacoplado do ORM.
 */
export interface OutboxEventLike {
  id: string;
  status: string;
  attempts: number;
  nextAttemptAt: Date | null;
  createdAt: Date;
}

/**
 * Atraso (ms) antes da proxima tentativa, em backoff exponencial e limitado
 * pelo teto. `attempts` e o numero da tentativa que vai acontecer (1-based).
 */
export function backoffDelayMs(attempts: number): number {
  const safe = Math.max(1, Math.floor(attempts));
  const delay = OUTBOX_BACKOFF_BASE_MS * 2 ** (safe - 1);
  return Math.min(delay, OUTBOX_BACKOFF_MAX_MS);
}

/** Instante da proxima tentativa a partir de agora e do numero da tentativa. */
export function nextAttemptAt(now: Date, attempts: number): Date {
  return new Date(now.getTime() + backoffDelayMs(attempts));
}

/** Um evento cujas tentativas esgotaram nao deve mais ser reprocessado. */
export function isExhausted(attempts: number): boolean {
  return attempts >= OUTBOX_MAX_ATTEMPTS;
}

/** Um evento so esta pronto quando esta pendente e passou do horario marcado. */
export function isReady(event: OutboxEventLike, now: Date): boolean {
  if (event.status !== OUTBOX_PENDING) return false;
  if (!event.nextAttemptAt) return true;
  return event.nextAttemptAt.getTime() <= now.getTime();
}

/**
 * Seleciona os eventos prontos, mais antigos primeiro, respeitando o limite do
 * lote. A ordenacao por `createdAt` preserva a ordem de gravacao das escritas.
 */
export function selectReadyEvents<T extends OutboxEventLike>(events: T[], now: Date, limit: number): T[] {
  return events
    .filter((event) => isReady(event, now))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .slice(0, Math.max(0, limit));
}

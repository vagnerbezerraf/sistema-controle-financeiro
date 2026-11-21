/**
 * Suporte offline compartilhado entre Web, Desktop e Mobile.
 *
 * Duas pecas, ambas puras e testaveis sem rede nem banco:
 * - OfflineQueue: fila de escritas (mutacoes) que sobrevive a queda de rede,
 *   reexecutavel em ordem com backoff e chave de idempotencia (evita duplicar
 *   quando o pedido e reenviado). Conflitos (ex.: versao desatualizada na
 *   concorrencia otimista) nao entram em retentativa automatica: ficam marcados
 *   como `conflict` para reconciliacao manual.
 * - OfflineCache: cache de leitura (write-through) para servir dados ja vistos
 *   quando o app esta offline.
 *
 * A persistencia fica atras de KeyValueStore (localStorage no Web/Desktop,
 * SecureStore no Mobile) e o envio atras de OfflineTransport, o que torna a
 * logica totalmente testavel com implementacoes em memoria.
 */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface PendingRequest {
  method: HttpMethod;
  path: string;
  body?: unknown;
  spaceId?: string;
}

export type OfflineMutationStatus = 'pending' | 'syncing' | 'failed' | 'conflict';

export interface OfflineMutation extends PendingRequest {
  /** Identificador local da mutacao (nao vai para a API). */
  id: string;
  /** Enviado como cabecalho `idempotency-key` para nao duplicar no reenvio. */
  idempotencyKey: string;
  /** Epoch em ms em que a mutacao entrou na fila. */
  createdAt: number;
  /** Tentativas de envio ja realizadas. */
  attempts: number;
  /** Proxima tentativa permitida (epoch ms). */
  nextAttemptAt: number;
  status: OfflineMutationStatus;
  lastError?: string;
}

export interface FlushResult {
  synced: number;
  failed: number;
  remaining: number;
}

export interface CacheRecord<T = unknown> {
  value: T;
  storedAt: number;
}

/** KV minimo, implementado por localStorage (Desktop) e SecureStore (Mobile). */
export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

/** Envio real de uma mutacao (a API). Pode lancar para sinalizar falha. */
export interface OfflineTransport {
  send(mutation: OfflineMutation): Promise<unknown>;
}

// ---------------------------------------------------------------------------
// Helpers puros
// ---------------------------------------------------------------------------

/** Codigo devolvido pela API quando a `version` enviada ficou desatualizada. */
export const STALE_VERSION_CODE = 'STALE_VERSION';

/**
 * Reconhece um conflito de escrita a partir do erro da API: HTTP 409
 * (`Conflict`) ou o codigo `STALE_VERSION` da concorrencia otimista. Conflitos
 * nao entram em retentativa automatica — reenviar o mesmo corpo daria 409 de
 * novo —, entao a fila os marca como `conflict` para reconciliacao manual.
 */
export function isConflictError(error: unknown): boolean {
  const candidate = error as { status?: number; code?: string } | null;
  if (!candidate) return false;
  if (candidate.status === 409) return true;
  return candidate.code === STALE_VERSION_CODE;
}

export function isMutationMethod(method: HttpMethod): boolean {
  return method !== 'GET';
}

export function generateIdempotencyKey(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Backoff exponencial (base 1s, teto 60s por padrao). */
export function backoffDelayMs(attempts: number, baseMs = 1000, maxMs = 60_000): number {
  if (attempts <= 0) return 0;
  const raw = baseMs * 2 ** (attempts - 1);
  return Math.min(raw, maxMs);
}

export function isReadyToSync(mutation: OfflineMutation, now: number): boolean {
  if (mutation.status === 'failed' || mutation.status === 'conflict') return false;
  return mutation.nextAttemptAt <= now;
}

/** FIFO estavel por `createdAt` (desempate pelo id). */
export function orderQueue(mutations: OfflineMutation[]): OfflineMutation[] {
  return [...mutations].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}

export function cacheKeyFor(input: { path: string; spaceId?: string; method?: HttpMethod }): string {
  const method = input.method ?? 'GET';
  return `${method} ${input.spaceId ?? '-'} ${input.path}`;
}

/** `ttlMs <= 0` = sem expiracao. */
export function isCacheFresh(record: CacheRecord, now: number, ttlMs: number): boolean {
  if (ttlMs <= 0) return true;
  return now - record.storedAt <= ttlMs;
}

export function createMemoryStore(initial?: Record<string, string>): KeyValueStore {
  const map = new Map<string, string>(Object.entries(initial ?? {}));
  return {
    async get(key) {
      return map.has(key) ? (map.get(key) as string) : null;
    },
    async set(key, value) {
      map.set(key, value);
    },
    async remove(key) {
      map.delete(key);
    },
  };
}

function parseList(raw: string | null): OfflineMutation[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Uma mutacao presa em 'syncing' (crash durante o flush) volta a ser 'pending'.
    return parsed.map((m: OfflineMutation) => (m.status === 'syncing' ? { ...m, status: 'pending' } : m));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Fila de escritas
// ---------------------------------------------------------------------------

export interface OfflineQueueDeps {
  store: KeyValueStore;
  transport: OfflineTransport;
  isOnline?: () => boolean;
  now?: () => number;
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  queueKey?: string;
  /** Reconhece erro de conflito (padrao: `isConflictError`). */
  isConflict?: (error: unknown) => boolean;
}

export interface FlushOptions {
  /** Reprocessa tambem as mutacoes `failed`/`conflict` (botao manual). */
  includeFailed?: boolean;
}

export interface OfflineQueue {
  enqueue(req: PendingRequest): Promise<OfflineMutation>;
  list(): Promise<OfflineMutation[]>;
  pendingCount(): Promise<number>;
  conflictCount(): Promise<number>;
  flush(options?: FlushOptions): Promise<FlushResult>;
  discard(id: string): Promise<void>;
  /** Remove todas as mutacoes em conflito (reconciliacao: descartar o local). */
  discardConflicts(): Promise<number>;
  subscribe(listener: () => void): () => void;
}

export function createOfflineQueue(deps: OfflineQueueDeps): OfflineQueue {
  const {
    store,
    transport,
    isOnline = () => true,
    now = () => Date.now(),
    maxAttempts = 5,
    baseDelayMs = 1000,
    maxDelayMs = 60_000,
    queueKey = 'scf.offline.queue',
    isConflict = isConflictError,
  } = deps;

  const listeners = new Set<() => void>();
  let inFlight: Promise<FlushResult> | null = null;

  async function load(): Promise<OfflineMutation[]> {
    return parseList(await store.get(queueKey));
  }

  async function save(queue: OfflineMutation[]): Promise<void> {
    await store.set(queueKey, JSON.stringify(queue));
    for (const listener of listeners) listener();
  }

  async function runFlush(options: FlushOptions): Promise<FlushResult> {
    const queue = await load();
    if (!isOnline()) {
      return { synced: 0, failed: 0, remaining: queue.length };
    }

    // Reprocessa 'failed'/'conflict' quando pedido explicitamente (sync manual).
    const normalized: OfflineMutation[] = options.includeFailed
      ? queue.map((m): OfflineMutation =>
          m.status === 'failed' || m.status === 'conflict' ? { ...m, status: 'pending', nextAttemptAt: 0 } : m,
        )
      : queue;

    const at = now();
    const readyIds = new Set(orderQueue(normalized).filter((m) => isReadyToSync(m, at)).map((m) => m.id));

    let synced = 0;
    let failed = 0;
    const next: OfflineMutation[] = [];

    for (const mutation of normalized) {
      if (!readyIds.has(mutation.id)) {
        next.push(mutation);
        continue;
      }
      try {
        await transport.send(mutation);
        synced += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // Conflito (ex.: versao desatualizada): nao adianta reenviar o mesmo
        // corpo, entao fica retido para reconciliacao manual em vez de consumir
        // tentativas no backoff.
        if (isConflict(error)) {
          next.push({ ...mutation, status: 'conflict', lastError: message } satisfies OfflineMutation);
          continue;
        }
        const attempts = mutation.attempts + 1;
        if (attempts >= maxAttempts) {
          failed += 1;
          next.push({ ...mutation, attempts, status: 'failed', lastError: message } satisfies OfflineMutation);
        } else {
          next.push({
            ...mutation,
            attempts,
            status: 'pending',
            lastError: message,
            nextAttemptAt: now() + backoffDelayMs(attempts, baseDelayMs, maxDelayMs),
          } satisfies OfflineMutation);
        }
      }
    }

    await save(next);
    return { synced, failed, remaining: next.length };
  }

  return {
    async enqueue(req) {
      const created: OfflineMutation = {
        ...req,
        id: generateIdempotencyKey(),
        idempotencyKey: generateIdempotencyKey(),
        createdAt: now(),
        attempts: 0,
        nextAttemptAt: now(),
        status: 'pending',
      };
      const queue = await load();
      await save([...queue, created]);
      return created;
    },

    async list() {
      return orderQueue(await load());
    },

    async pendingCount() {
      return (await load()).length;
    },

    async conflictCount() {
      return (await load()).filter((m) => m.status === 'conflict').length;
    },

    flush(options = {}) {
      // Um flush por vez: disparos concorrentes (reconexao + intervalo + uma
      // leitura que voltou) compartilham a mesma execucao e nao duplicam envios.
      if (inFlight) return inFlight;
      inFlight = runFlush(options).finally(() => {
        inFlight = null;
      });
      return inFlight;
    },

    async discard(id) {
      const queue = await load();
      await save(queue.filter((m) => m.id !== id));
    },

    async discardConflicts() {
      const queue = await load();
      const kept = queue.filter((m) => m.status !== 'conflict');
      const removed = queue.length - kept.length;
      if (removed > 0) await save(kept);
      return removed;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

// ---------------------------------------------------------------------------
// Cache de leitura
// ---------------------------------------------------------------------------

export interface OfflineCacheDeps {
  store: KeyValueStore;
  now?: () => number;
  /** `<= 0` desliga a expiracao (sempre servivel como ultimo recurso). */
  ttlMs?: number;
  prefix?: string;
  indexKey?: string;
}

export interface ReadOptions {
  /** Ignora o TTL e devolve o valor mesmo vencido (uso tipico: offline). */
  allowStale?: boolean;
}

export interface OfflineCache {
  write<T>(key: string, value: T): Promise<void>;
  read<T>(key: string, options?: ReadOptions): Promise<T | null>;
  invalidate(key: string): Promise<void>;
  clear(): Promise<void>;
  keys(): Promise<string[]>;
}

export function createOfflineCache(deps: OfflineCacheDeps): OfflineCache {
  const { store, now = () => Date.now(), ttlMs = 24 * 60 * 60 * 1000, prefix = 'scf.offline.cache', indexKey = 'scf.offline.cache.index' } = deps;

  const entryKey = (key: string) => `${prefix}:${key}`;

  async function readIndex(): Promise<string[]> {
    const raw = await store.get(indexKey);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as string[]) : [];
    } catch {
      return [];
    }
  }

  async function writeIndex(keys: string[]): Promise<void> {
    await store.set(indexKey, JSON.stringify(keys));
  }

  return {
    async write(key, value) {
      await store.set(entryKey(key), JSON.stringify({ value, storedAt: now() } satisfies CacheRecord));
      const keys = await readIndex();
      if (!keys.includes(key)) await writeIndex([...keys, key]);
    },

    async read(key, options = {}) {
      const raw = await store.get(entryKey(key));
      if (!raw) return null;
      let record: CacheRecord;
      try {
        record = JSON.parse(raw) as CacheRecord;
      } catch {
        return null;
      }
      if (!options.allowStale && !isCacheFresh(record, now(), ttlMs)) return null;
      return record.value as never;
    },

    async invalidate(key) {
      await store.remove(entryKey(key));
      const keys = await readIndex();
      await writeIndex(keys.filter((k) => k !== key));
    },

    async clear() {
      const keys = await readIndex();
      await Promise.all(keys.map((k) => store.remove(entryKey(k))));
      await store.remove(indexKey);
    },

    async keys() {
      return readIndex();
    },
  };
}

import { describe, expect, it, vi } from 'vitest';
import {
  backoffDelayMs,
  cacheKeyFor,
  createMemoryStore,
  createOfflineCache,
  createOfflineQueue,
  generateIdempotencyKey,
  isCacheFresh,
  isMutationMethod,
  orderQueue,
  type OfflineMutation,
  type OfflineTransport,
  type PendingRequest,
} from './index';

function makeMutation(overrides: Partial<OfflineMutation> = {}): OfflineMutation {
  return {
    id: 'id',
    method: 'POST',
    path: '/transactions',
    idempotencyKey: 'key',
    createdAt: 0,
    attempts: 0,
    nextAttemptAt: 0,
    status: 'pending',
    ...overrides,
  };
}

describe('helpers puros', () => {
  it('classifica metodos de escrita', () => {
    expect(isMutationMethod('GET')).toBe(false);
    expect(isMutationMethod('POST')).toBe(true);
    expect(isMutationMethod('PUT')).toBe(true);
    expect(isMutationMethod('PATCH')).toBe(true);
    expect(isMutationMethod('DELETE')).toBe(true);
  });

  it('gera chaves de idempotencia distintas', () => {
    const keys = new Set(Array.from({ length: 50 }, () => generateIdempotencyKey()));
    expect(keys.size).toBe(50);
  });

  it('calcula backoff exponencial com teto', () => {
    expect(backoffDelayMs(0)).toBe(0);
    expect(backoffDelayMs(1, 1000, 60_000)).toBe(1000);
    expect(backoffDelayMs(2, 1000, 60_000)).toBe(2000);
    expect(backoffDelayMs(3, 1000, 60_000)).toBe(4000);
    expect(backoffDelayMs(10, 1000, 60_000)).toBe(60_000);
  });

  it('ordena a fila por createdAt e desempata por id', () => {
    const a = makeMutation({ id: 'b', createdAt: 1 });
    const b = makeMutation({ id: 'a', createdAt: 1 });
    const c = makeMutation({ id: 'c', createdAt: 0 });
    expect(orderQueue([a, b, c]).map((m) => m.id)).toEqual(['c', 'a', 'b']);
  });

  it('monta a chave de cache com metodo, espaco e path', () => {
    expect(cacheKeyFor({ path: '/transactions', spaceId: 'sp1' })).toBe('GET sp1 /transactions');
    expect(cacheKeyFor({ path: '/transactions', spaceId: 'sp1', method: 'POST' })).toBe('POST sp1 /transactions');
    expect(cacheKeyFor({ path: '/categories' })).toBe('GET - /categories');
  });

  it('avalia a validade do cache conforme o TTL', () => {
    const record = { value: 1, storedAt: 1000 };
    expect(isCacheFresh(record, 1500, 1000)).toBe(true);
    expect(isCacheFresh(record, 2500, 1000)).toBe(false);
    expect(isCacheFresh(record, 999_999, 0)).toBe(true);
  });
});

describe('fila de escritas', () => {
  function setup(deps: {
    send?: OfflineTransport['send'];
    isOnline?: () => boolean;
    now?: () => number;
    maxAttempts?: number;
    baseDelayMs?: number;
    store?: ReturnType<typeof createMemoryStore>;
  } = {}) {
    const send = vi.fn(deps.send ?? (async () => undefined));
    const transport: OfflineTransport = { send };
    const store = deps.store ?? createMemoryStore();
    const queue = createOfflineQueue({
      store,
      transport,
      isOnline: deps.isOnline,
      now: deps.now,
      maxAttempts: deps.maxAttempts,
      baseDelayMs: deps.baseDelayMs,
    });
    return { queue, store, send };
  }

  it('enfileira mutacoes em ordem FIFO', async () => {
    let tick = 0;
    const { queue } = setup({ now: () => tick++ });
    const first = await queue.enqueue({ method: 'POST', path: '/a' });
    const second = await queue.enqueue({ method: 'POST', path: '/b' });

    expect((await queue.list()).map((m) => m.id)).toEqual([first.id, second.id]);
    expect(await queue.pendingCount()).toBe(2);
    expect(first.idempotencyKey).not.toBe(second.idempotencyKey);
  });

  it('nao envia nada quando offline e preserva a fila', async () => {
    const { queue, send } = setup({ isOnline: () => false });
    await queue.enqueue({ method: 'POST', path: '/a' });

    const result = await queue.flush();

    expect(result).toEqual({ synced: 0, failed: 0, remaining: 1 });
    expect(send).not.toHaveBeenCalled();
  });

  it('remove da fila as mutacoes enviadas com sucesso', async () => {
    const { queue, send } = setup();
    await queue.enqueue({ method: 'POST', path: '/a' });
    await queue.enqueue({ method: 'POST', path: '/b' });

    const result = await queue.flush();

    expect(result).toEqual({ synced: 2, failed: 0, remaining: 0 });
    expect(send).toHaveBeenCalledTimes(2);
    expect(await queue.pendingCount()).toBe(0);
  });

  it('nao duplica envios quando o flush e disparado em paralelo', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { queue, send } = setup({
      send: async () => {
        await gate;
      },
    });
    await queue.enqueue({ method: 'POST', path: '/a' });

    const first = queue.flush();
    const second = queue.flush();
    release();
    const [r1, r2] = await Promise.all([first, second]);

    expect(send).toHaveBeenCalledTimes(1);
    expect(r1).toEqual({ synced: 1, failed: 0, remaining: 0 });
    expect(r2).toBe(r1); // disparos concorrentes compartilham a mesma execucao
  });

  it('reenvia com backoff quando o envio falha', async () => {
    const now = 10_000;
    const { queue, store } = setup({
      send: async () => {
        throw new Error('sem rede');
      },
      now: () => now,
      baseDelayMs: 1000,
    });
    const created = await queue.enqueue({ method: 'POST', path: '/a' });

    const result = await queue.flush();

    expect(result).toEqual({ synced: 0, failed: 0, remaining: 1 });
    const [stored] = await queue.list();
    expect(stored.status).toBe('pending');
    expect(stored.attempts).toBe(1);
    expect(stored.lastError).toBe('sem rede');
    expect(stored.nextAttemptAt).toBe(now + 1000);
    expect(stored.id).toBe(created.id);
    // A mutacao reenviada mantem a chave de idempotencia original.
    expect(stored.idempotencyKey).toBe(created.idempotencyKey);
    expect(store).toBeDefined();
  });

  it('nao reenvia antes da janela de backoff', async () => {
    let current = 0;
    const { queue, send } = setup({
      send: async () => {
        throw new Error('sem rede');
      },
      now: () => current,
      baseDelayMs: 1000,
    });
    await queue.enqueue({ method: 'POST', path: '/a' });
    await queue.flush(); // attempts=1, nextAttemptAt=1000

    const result = await queue.flush(); // current=0, ainda nao pode

    expect(result).toEqual({ synced: 0, failed: 0, remaining: 1 });
    expect(send).toHaveBeenCalledTimes(1);

    current = 1000;
    await queue.flush();
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('marca como failed apos esgotar as tentativas', async () => {
    let current = 0;
    const { queue } = setup({
      send: async () => {
        throw new Error('sem rede');
      },
      now: () => current,
      maxAttempts: 2,
      baseDelayMs: 1,
    });
    await queue.enqueue({ method: 'POST', path: '/a' });

    current = 0;
    await queue.flush(); // attempts=1 -> pending
    current = 1;
    const result = await queue.flush(); // attempts=2 -> failed

    expect(result).toEqual({ synced: 0, failed: 1, remaining: 1 });
    const [stored] = await queue.list();
    expect(stored.status).toBe('failed');
  });

  it('nao reprocessa failed por padrao, mas sim com includeFailed', async () => {
    let current = 0;
    let shouldFail = true;
    const { queue, send } = setup({
      send: async () => {
        if (shouldFail) throw new Error('sem rede');
      },
      now: () => current,
      maxAttempts: 1,
      baseDelayMs: 1,
    });
    await queue.enqueue({ method: 'POST', path: '/a' });
    await queue.flush(); // attempts=1 -> failed

    const idle = await queue.flush();
    expect(idle.synced).toBe(0);
    expect(send).toHaveBeenCalledTimes(1);

    shouldFail = false;
    current = 100;
    const retry = await queue.flush({ includeFailed: true });

    expect(retry).toEqual({ synced: 1, failed: 0, remaining: 0 });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('recupera mutacoes presas em syncing (crash durante o flush)', async () => {
    const store = createMemoryStore({
      'scf.offline.queue': JSON.stringify([makeMutation({ id: 'a', status: 'syncing' })]),
    });
    const { queue, send } = setup({ store });

    const result = await queue.flush();

    expect(result.synced).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('descarta uma mutacao pelo id', async () => {
    const { queue } = setup();
    const a = await queue.enqueue({ method: 'POST', path: '/a' });
    await queue.enqueue({ method: 'POST', path: '/b' });

    await queue.discard(a.id);

    expect((await queue.list()).map((m) => m.path)).toEqual(['/b']);
  });

  it('notifica os assinantes a cada alteracao da fila', async () => {
    const { queue } = setup();
    const listener = vi.fn();
    const unsubscribe = queue.subscribe(listener);

    await queue.enqueue({ method: 'POST', path: '/a' });
    expect(listener).toHaveBeenCalledTimes(1);

    await queue.flush();
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    await queue.enqueue({ method: 'POST', path: '/b' });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('tolera JSON corrompido no armazenamento', async () => {
    const store = createMemoryStore({ 'scf.offline.queue': '{nao-e-json' });
    const { queue, send } = setup({ store });

    expect(await queue.list()).toEqual([]);
    const result = await queue.flush();
    expect(result.remaining).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });
});

describe('cache de leitura', () => {
  function setup(deps: { now?: () => number; ttlMs?: number } = {}) {
    const store = createMemoryStore();
    const cache = createOfflineCache({ store, now: deps.now, ttlMs: deps.ttlMs });
    return { cache, store };
  }

  it('grava e le um valor', async () => {
    const { cache } = setup();
    await cache.write('GET sp1 /transactions', [{ id: 't1' }]);

    expect(await cache.read('GET sp1 /transactions')).toEqual([{ id: 't1' }]);
    expect(await cache.keys()).toEqual(['GET sp1 /transactions']);
  });

  it('retorna null quando a entrada esta vencida', async () => {
    let current = 0;
    const { cache } = setup({ now: () => current, ttlMs: 1000 });
    await cache.write('k', 'v');

    expect(await cache.read('k')).toBe('v');
    current = 2000;
    expect(await cache.read('k')).toBeNull();
  });

  it('devolve valor vencido com allowStale', async () => {
    let current = 0;
    const { cache } = setup({ now: () => current, ttlMs: 1000 });
    await cache.write('k', 'v');

    current = 5000;
    expect(await cache.read('k', { allowStale: true })).toBe('v');
  });

  it('retorna null para chave inexistente', async () => {
    const { cache } = setup();
    expect(await cache.read('nada')).toBeNull();
  });

  it('invalida uma chave especifica', async () => {
    const { cache } = setup();
    await cache.write('a', 1);
    await cache.write('b', 2);

    await cache.invalidate('a');

    expect(await cache.read('a')).toBeNull();
    expect(await cache.read('b')).toBe(2);
    expect(await cache.keys()).toEqual(['b']);
  });

  it('limpa todas as entradas', async () => {
    const { cache } = setup();
    await cache.write('a', 1);
    await cache.write('b', 2);

    await cache.clear();

    expect(await cache.keys()).toEqual([]);
    expect(await cache.read('a')).toBeNull();
    expect(await cache.read('b')).toBeNull();
  });

  it('nao duplica a chave no indice ao reescrever', async () => {
    const { cache } = setup();
    await cache.write('a', 1);
    await cache.write('a', 2);

    expect(await cache.keys()).toEqual(['a']);
    expect(await cache.read('a')).toBe(2);
  });
});

describe('store em memoria', () => {
  it('implementa o contrato de KeyValueStore', async () => {
    const store = createMemoryStore({ inicial: 'v' });
    expect(await store.get('inicial')).toBe('v');
    await store.set('novo', 'x');
    expect(await store.get('novo')).toBe('x');
    await store.remove('novo');
    expect(await store.get('novo')).toBeNull();
    expect(await store.get('ausente')).toBeNull();
  });
});

describe('tipos publicos', () => {
  it('PendingRequest aceita corpo e espaco', () => {
    const req: PendingRequest = { method: 'POST', path: '/a', body: { x: 1 }, spaceId: 'sp1' };
    expect(req.spaceId).toBe('sp1');
  });
});

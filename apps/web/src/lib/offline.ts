/**
 * Suporte offline do Web.
 *
 * - Persistencia em localStorage (KeyValueStore).
 * - Cache de leitura: guarda o ultimo resultado de cada GET para servir quando
 *   a rede cai.
 * - Fila de escritas: mutacoes feitas offline ficam guardadas e sao reenviadas
 *   quando a conexao volta (evento `online` ou o intervalo de retentativa).
 * - Conflitos (ex.: versao desatualizada) ficam retidos para reconciliacao
 *   manual em vez de retentar em loop.
 *
 * O transporte (a chamada HTTP real) e injetado pela lib/api-client para evitar
 * dependencia circular.
 */
import {
  createOfflineCache,
  createOfflineQueue,
  type KeyValueStore,
  type OfflineTransport,
} from '@scf/offline';

const hasWindow = typeof window !== 'undefined';

const store: KeyValueStore = {
  async get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  async set(key, value) {
    localStorage.setItem(key, value);
  },
  async remove(key) {
    localStorage.removeItem(key);
  },
};

export const offlineCache = createOfflineCache({ store });

let transport: OfflineTransport | null = null;

/** Registrado uma vez pela lib/api-client com a implementacao real de envio. */
export function setOfflineTransport(next: OfflineTransport): void {
  transport = next;
}

let online = hasWindow ? navigator.onLine : true;
let pending = 0;
let conflicts = 0;

const listeners = new Set<() => void>();
function emit(): void {
  for (const listener of listeners) listener();
}

async function refreshCounts(): Promise<void> {
  const queue = await offlineQueue.list();
  pending = queue.length;
  conflicts = queue.filter((m) => m.status === 'conflict').length;
  emit();
}

export const offlineQueue = createOfflineQueue({
  store,
  transport: {
    async send(mutation) {
      if (!transport) throw new Error('transporte offline nao configurado');
      return transport.send(mutation);
    },
  },
  isOnline: () => online,
});

offlineQueue.subscribe(() => {
  void refreshCounts();
});
void refreshCounts();

export function isOnline(): boolean {
  return online;
}

export function setOnline(next: boolean): void {
  if (next === online) return;
  online = next;
  emit();
}

/** Falha de rede (nao chegou ao servidor) e nao um erro HTTP da API. */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  const name = (error as { name?: string } | null)?.name;
  return name === 'TypeError' || name === 'NetworkError';
}

export function subscribeOffline(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Snapshot estavel para useSyncExternalStore: `<online|offline>|<pendentes>|<conflitos>`. */
export function getOfflineSnapshot(): string {
  return `${online ? 'online' : 'offline'}|${pending}|${conflicts}`;
}

/** Tenta reenviar as mutacoes guardadas (botao manual ou reconexao). */
export async function flushOfflineQueue(includeFailed = false): Promise<void> {
  await offlineQueue.flush({ includeFailed });
}

/** Reconciliacao: descarta as mutacoes em conflito (mantem a copia do servidor). */
export async function discardOfflineConflicts(): Promise<number> {
  return offlineQueue.discardConflicts();
}

if (hasWindow) {
  window.addEventListener('online', () => setOnline(true));
  window.addEventListener('offline', () => setOnline(false));
  window.setInterval(() => {
    void offlineQueue.flush();
  }, 30_000);
}

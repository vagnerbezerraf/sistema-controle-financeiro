/**
 * Suporte offline do Desktop.
 *
 * - Persistencia em localStorage (KeyValueStore).
 * - Cache de leitura: guarda o ultimo resultado de cada GET para servir quando
 *   a rede cai.
 * - Fila de escritas: mutacoes feitas offline ficam guardadas e sao reenviadas
 *   quando a conexao volta (evento `online` ou o intervalo de retentativa).
 *
 * O transporte (a chamada HTTP real) e injetado pela lib/api para evitar
 * dependencia circular.
 */
import {
  createOfflineCache,
  createOfflineQueue,
  type KeyValueStore,
  type OfflineTransport,
} from '@scf/offline';

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

/** Registrado uma vez pela lib/api com a implementacao real de envio. */
export function setOfflineTransport(next: OfflineTransport): void {
  transport = next;
}

let online = typeof navigator !== 'undefined' ? navigator.onLine : true;
let pending = 0;

const listeners = new Set<() => void>();
function emit(): void {
  for (const listener of listeners) listener();
}

async function refreshPending(): Promise<void> {
  pending = (await offlineQueue.list()).length;
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
  void refreshPending();
});
void refreshPending();

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

/** Snapshot estavel para useSyncExternalStore: `<online|offline>|<pendentes>`. */
export function getOfflineSnapshot(): string {
  return `${online ? 'online' : 'offline'}|${pending}`;
}

/** Tenta reenviar as mutacoes guardadas (botao manual ou reconexao). */
export async function flushOfflineQueue(includeFailed = false): Promise<void> {
  await offlineQueue.flush({ includeFailed });
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => setOnline(true));
  window.addEventListener('offline', () => setOnline(false));
  window.setInterval(() => {
    void offlineQueue.flush();
  }, 30_000);
}

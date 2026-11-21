/**
 * Suporte offline do Mobile.
 *
 * - Persistencia via expo-secure-store. Como o SecureStore recebe um unico
 *   valor por chave, o KeyValueStore e um blob JSON guardado sob uma chave fixa
 *   e mantido em memoria entre leituras.
 * - Cache de leitura: ultimo resultado de cada GET para servir quando a rede cai.
 * - Fila de escritas: mutacoes feitas offline ficam guardadas e sao reenviadas
 *   quando a conexao volta (retorno do app ao primeiro plano ou intervalo).
 *
 * O transporte (a chamada HTTP real) e injetado pela lib/api para evitar
 * dependencia circular.
 */
import { AppState } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import {
  createOfflineCache,
  createOfflineQueue,
  type KeyValueStore,
  type OfflineTransport,
} from '@scf/offline';

const BLOB_KEY = 'scf.offline.kv';

let blob: Record<string, string> | null = null;

async function loadBlob(): Promise<Record<string, string>> {
  if (blob) return blob;
  try {
    const raw = await SecureStore.getItemAsync(BLOB_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    blob = parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    blob = {};
  }
  return blob;
}

async function persist(): Promise<void> {
  try {
    await SecureStore.setItemAsync(BLOB_KEY, JSON.stringify(blob ?? {}));
  } catch {
    // Sem espaco no armazenamento seguro: mantem apenas a copia em memoria.
  }
}

const store: KeyValueStore = {
  async get(key) {
    const b = await loadBlob();
    return key in b ? b[key] : null;
  },
  async set(key, value) {
    const b = await loadBlob();
    b[key] = value;
    await persist();
  },
  async remove(key) {
    const b = await loadBlob();
    if (key in b) {
      delete b[key];
      await persist();
    }
  },
};

export const offlineCache = createOfflineCache({ store });

let transport: OfflineTransport | null = null;

/** Registrado uma vez pela lib/api com a implementacao real de envio. */
export function setOfflineTransport(next: OfflineTransport): void {
  transport = next;
}

let online = true;
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

/** Tenta reenviar as mutacoes guardadas (acao manual ou reconexao). */
export async function flushOfflineQueue(includeFailed = false): Promise<void> {
  await offlineQueue.flush({ includeFailed });
}

/** Reconciliacao: descarta as mutacoes em conflito (mantem a copia do servidor). */
export async function discardOfflineConflicts(): Promise<number> {
  return offlineQueue.discardConflicts();
}

// Ao voltar ao primeiro plano, tenta sincronizar o que ficou na fila.
AppState.addEventListener('change', (state) => {
  if (state === 'active') void offlineQueue.flush();
});

setInterval(() => {
  void offlineQueue.flush();
}, 30_000);

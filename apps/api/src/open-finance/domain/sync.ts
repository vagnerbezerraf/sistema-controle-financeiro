/**
 * Dominio puro da sincronizacao incremental de Open Finance (Fase 5).
 *
 * Depois que um consentimento esta autorizado, o agregador entrega os
 * lancamentos em paginas, cada uma com o cursor para a proxima leitura. Aqui
 * ficam apenas as decisoes puras dessa leitura: como traduzir o valor para o
 * tipo/direcao do SCF, quais lancamentos ainda nao foram importados e como
 * guardar os identificadores ja vistos. Nada aqui toca rede nem banco.
 *
 * Comentarios sem acentos por convencao do projeto.
 */

/** Lancamento como o agregador o reporta. `amount` tem sinal: negativo = saida. */
export interface ProviderTransaction {
  /** Identificador do lancamento no agregador (chave de deduplicacao). */
  externalId: string;
  /** Data do lancamento no formato `YYYY-MM-DD`. */
  postedAt: string;
  description: string;
  /** Valor com sinal, como string decimal (ex.: `-152.30`). */
  amount: string;
}

/** Pagina de lancamentos do agregador, com o cursor para a proxima leitura. */
export interface ProviderTransactionPage {
  transactions: ProviderTransaction[];
  /** Cursor da proxima pagina; `null` quando nao ha mais o que ler. */
  nextCursor: string | null;
  hasMore: boolean;
}

/** Tipo do lancamento no SCF, inferido pelo sinal do valor. */
export type SyncTransactionType = 'income' | 'expense';

/** Direcao do lancamento na conta (partida dobrada). */
export type SyncPostingDirection = 'debit' | 'credit';

/** Teto de identificadores guardados por consentimento (evita crescimento sem fim). */
export const MAX_SYNCED_IDS = 5000;

/** Um valor negativo e uma saida; zero ou positivo e uma entrada. */
export function directionForAmount(amount: string): SyncTransactionType {
  const value = Number(amount);
  return Number.isFinite(value) && value < 0 ? 'expense' : 'income';
}

/** Na conta, a entrada debita (o ativo cresce) e a saida credita (o ativo cai). */
export function postingDirectionFor(type: SyncTransactionType): SyncPostingDirection {
  return type === 'income' ? 'debit' : 'credit';
}

/** Valor sem o sinal, que ja esta representado pelo tipo do lancamento. */
export function signlessAmount(amount: string): string {
  const trimmed = amount.trim();
  if (trimmed.startsWith('-') || trimmed.startsWith('+')) return trimmed.slice(1);
  return trimmed;
}

/**
 * Filtra o que ainda nao foi importado: descarta o que ja consta em `syncedIds`
 * e tambem repeticoes dentro da propria pagina (o agregador pode sobrepor
 * janelas). Preserva a ordem recebida.
 */
export function selectNewTransactions(
  syncedIds: readonly string[],
  incoming: readonly ProviderTransaction[],
): ProviderTransaction[] {
  const seen = new Set(syncedIds);
  const result: ProviderTransaction[] = [];
  for (const transaction of incoming) {
    if (seen.has(transaction.externalId)) continue;
    seen.add(transaction.externalId);
    result.push(transaction);
  }
  return result;
}

/**
 * Funde os identificadores ja sincronizados com os novos, sem repetir. Quando
 * passa do teto, mantem os mais recentes (os ultimos adicionados).
 */
export function mergeSyncedIds(
  existing: readonly string[],
  added: readonly string[],
  cap: number = MAX_SYNCED_IDS,
): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const id of [...existing, ...added]) {
    if (seen.has(id)) continue;
    seen.add(id);
    merged.push(id);
  }
  return merged.length > cap ? merged.slice(merged.length - cap) : merged;
}

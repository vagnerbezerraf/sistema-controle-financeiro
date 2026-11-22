/**
 * Dominio puro da sincronizacao automatica de Open Finance (Fase 5).
 *
 * Espelha o dominio equivalente da API (`apps/api/src/open-finance/domain/sync.ts`):
 * o worker precisa das mesmas decisoes puras para importar periodicamente os
 * lancamentos dos consentimentos autorizados — traduzir o valor para o
 * tipo/direcao do SCF, descobrir o que ainda nao foi importado e guardar os
 * identificadores ja vistos. Aqui nao se toca rede nem banco. A esse conjunto
 * acrescenta a regra de **elegibilidade** de um consentimento para a sync
 * automatica (so quando autorizado, com identificador no provedor, conta de
 * destino definida e sem estar expirado).
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

/** Teto de paginas lidas por consentimento a cada ciclo (protege o job). */
export const DEFAULT_MAX_PAGES_PER_SYNC = 10;

/** Consentimento como o processador o consome (subconjunto dos campos do schema). */
export interface SyncableConsent {
  id: string;
  financialSpaceId: string;
  status: string;
  externalId: string | null;
  expiresAt: Date | null;
  targetAccountId: string | null;
}

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

/**
 * Elegibilidade para a sincronizacao automatica: o consentimento so e lido se
 * esta autorizado (e nao expirado em relacao a `now`, comparacao estrita `<`),
 * tem identificador no provedor e ja possui conta de destino definida — sem a
 * conta nao ha para onde importar. Consentimentos inelegiveis sao apenas
 * ignorados pelo ciclo, nunca tratados como falha.
 */
export function isConsentSyncable(consent: SyncableConsent, now: Date): boolean {
  const notExpired = !consent.expiresAt || consent.expiresAt.getTime() > now.getTime();
  const active = consent.status === 'authorized' && notExpired;
  return active && Boolean(consent.externalId) && Boolean(consent.targetAccountId);
}

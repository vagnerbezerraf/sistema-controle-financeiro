/**
 * Sincronizacao automatica de Open Finance no worker (Fase 5).
 *
 * Depois que um consentimento esta autorizado, a importacao dos lancamentos
 * nao precisa depender de o usuario clicar em **Sincronizar**: este job
 * periodico percorre os consentimentos sincronizaveis de todos os espacos e
 * importa o que houver de novo, reusando exatamente as mesmas decisoes da sync
 * manual da API (paginas por cursor, deduplicacao por identificador externo,
 * `Transaction`+`Posting` numa unica transacao junto do cursor/`lastSyncedAt`).
 *
 * Idempotencia: os identificadores ja importados ficam em `syncedExternalIds`,
 * entao reexecutar o ciclo (ou reagendar o repetivel) nao duplica lancamentos.
 * Tolerancia a indisponibilidade: cada consentimento e resolvido de forma
 * independente; a falha de um provedor e apenas registrada e contada, sem
 * derrubar os demais.
 *
 * A decisao pura vive em `./domain/open-finance-sync` e a persistencia fica
 * atras de um store injetavel (mesmo desenho dos outros canais do worker),
 * testavel sem rede e sem banco.
 */
import type { CurrencyCode, PrismaClient } from '@prisma/client';
import {
  DEFAULT_MAX_PAGES_PER_SYNC,
  directionForAmount,
  isConsentSyncable,
  mergeSyncedIds,
  postingDirectionFor,
  selectNewTransactions,
  signlessAmount,
  type ProviderTransaction,
  type ProviderTransactionPage,
} from './domain/open-finance-sync';

/** Le a pagina de lancamentos do agregador (o agregador real fica atras disto). */
export interface OpenFinanceTransactionProvider {
  fetchTransactions(input: { externalId: string; cursor?: string | null }): Promise<ProviderTransactionPage>;
}

/** Consentimento como o processador o consome (subconjunto dos campos do schema). */
export interface OpenFinanceConsentRecord {
  id: string;
  financialSpaceId: string;
  institutionId: string;
  status: string;
  externalId: string | null;
  expiresAt: Date | null;
  targetAccountId: string | null;
  syncCursor: string | null;
  syncedExternalIds: string[];
}

/** Conta de destino da importacao (so o que o processador precisa). */
export interface OpenFinanceSyncAccount {
  id: string;
  currency: CurrencyCode;
}

/** Dados de uma gravacao de sync (ja com o que foi lido e deduplicado). */
export interface ApplySyncInput {
  consentId: string;
  spaceId: string;
  institutionId: string;
  account: OpenFinanceSyncAccount;
  transactions: ProviderTransaction[];
  cursor: string | null;
  syncedIds: string[];
  skippedCount: number;
  hasMore: boolean;
}

/** Abstrai a persistencia da sync (implementado sobre o Prisma). */
export interface OpenFinanceSyncStore {
  /** Consentimentos autorizados com provedor, conta de destino e sem expirar. */
  findSyncableConsents(): Promise<OpenFinanceConsentRecord[]>;
  findConsent(id: string): Promise<OpenFinanceConsentRecord | null>;
  findAccount(accountId: string): Promise<OpenFinanceSyncAccount | null>;
  /** Grava os lancamentos novos e avanca o cursor/ids/auditoria numa transacao. */
  applySync(input: ApplySyncInput): Promise<{ importedCount: number }>;
}

/** Logger minimo aceito pelo processador (compativel com o pino do worker). */
export interface OpenFinanceSyncLogger {
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
  error(obj: Record<string, unknown>, msg: string): void;
}

export interface OpenFinanceSyncProcessorDeps {
  store: OpenFinanceSyncStore;
  provider: OpenFinanceTransactionProvider;
  logger: OpenFinanceSyncLogger;
  /** Injetavel para testes; padrao = relogio do sistema. */
  now?: () => Date;
  /** Teto de paginas por consentimento a cada ciclo (padrao = 10). */
  maxPagesPerSync?: number;
}

export interface OpenFinanceSyncRunResult {
  consents: number;
  importedCount: number;
  skippedCount: number;
  failedCount: number;
}

export interface OpenFinanceConsentSyncResult {
  handled: boolean;
  consentId?: string;
  importedCount: number;
  skippedCount: number;
  /** Motivo quando nada foi importado (consentimento inelegivel/ausente). */
  reason?: string;
}

export interface OpenFinanceSyncProcessor {
  /** Sincroniza todos os consentimentos sincronizaveis (ciclo periodico). */
  runAll(): Promise<OpenFinanceSyncRunResult>;
  /** Sincroniza um consentimento especifico (job pontual pelo `consentId`). */
  syncConsent(consentId: string): Promise<OpenFinanceConsentSyncResult>;
}

/**
 * Percorre os consentimentos e importa o que houver de novo. Cada um e resolvido
 * de forma independente: consentimentos inelegiveis sao ignorados e falhas sao
 * contadas, sem interromper o ciclo.
 */
export function createOpenFinanceSyncProcessor(deps: OpenFinanceSyncProcessorDeps): OpenFinanceSyncProcessor {
  const now = deps.now ?? (() => new Date());
  const maxPagesPerSync = deps.maxPagesPerSync ?? DEFAULT_MAX_PAGES_PER_SYNC;

  async function syncOne(consent: OpenFinanceConsentRecord): Promise<OpenFinanceConsentSyncResult> {
    const account = await deps.store.findAccount(consent.targetAccountId as string);
    if (!account) {
      deps.logger.warn(
        { consentId: consent.id, accountId: consent.targetAccountId },
        'Conta de destino ausente; sincronizacao ignorada',
      );
      return { handled: false, consentId: consent.id, importedCount: 0, skippedCount: 0, reason: 'ACCOUNT_NOT_FOUND' };
    }

    // Le as paginas primeiro (rede fora da transacao) acumulando apenas o novo.
    const toImport: ProviderTransaction[] = [];
    let cursor = consent.syncCursor;
    let syncedIds = [...consent.syncedExternalIds];
    let skippedCount = 0;
    let hasMore = false;

    for (let page = 0; page < maxPagesPerSync; page += 1) {
      const result = await deps.provider.fetchTransactions({
        externalId: consent.externalId as string,
        cursor,
      });
      const fresh = selectNewTransactions(syncedIds, result.transactions);
      skippedCount += result.transactions.length - fresh.length;
      toImport.push(...fresh);
      syncedIds = mergeSyncedIds(syncedIds, fresh.map((item) => item.externalId));
      cursor = result.nextCursor;
      hasMore = result.hasMore;
      if (!result.hasMore || !result.nextCursor) break;
    }

    const { importedCount } = await deps.store.applySync({
      consentId: consent.id,
      spaceId: consent.financialSpaceId,
      institutionId: consent.institutionId,
      account,
      transactions: toImport,
      cursor,
      syncedIds,
      skippedCount,
      hasMore,
    });

    deps.logger.info(
      { consentId: consent.id, accountId: account.id, importedCount, skippedCount, hasMore },
      'Consentimento sincronizado automaticamente',
    );
    return { handled: true, consentId: consent.id, importedCount, skippedCount };
  }

  return {
    async runAll(): Promise<OpenFinanceSyncRunResult> {
      const consents = await deps.store.findSyncableConsents();
      let importedCount = 0;
      let skippedCount = 0;
      let failedCount = 0;
      const at = now();

      for (const consent of consents) {
        if (!isConsentSyncable(consent, at)) continue;
        try {
          const result = await syncOne(consent);
          importedCount += result.importedCount;
          skippedCount += result.skippedCount;
        } catch (err) {
          failedCount += 1;
          deps.logger.error(
            { consentId: consent.id, err: (err as Error)?.message },
            'Falha ao sincronizar consentimento',
          );
        }
      }

      deps.logger.info(
        { consents: consents.length, importedCount, skippedCount, failedCount },
        'Ciclo de sincronizacao de Open Finance concluido',
      );
      return { consents: consents.length, importedCount, skippedCount, failedCount };
    },

    async syncConsent(consentId: string): Promise<OpenFinanceConsentSyncResult> {
      const consent = await deps.store.findConsent(consentId);
      if (!consent) {
        deps.logger.warn({ consentId }, 'Consentimento nao encontrado');
        return { handled: false, importedCount: 0, skippedCount: 0, reason: 'NOT_FOUND' };
      }
      if (!isConsentSyncable(consent, now())) {
        deps.logger.info({ consentId, status: consent.status }, 'Consentimento inelegivel para sincronizacao');
        return { handled: false, consentId, importedCount: 0, skippedCount: 0, reason: 'NOT_SYNCABLE' };
      }
      return syncOne(consent);
    },
  };
}

/** Instituicoes fixas do adaptador de desenvolvimento do worker. */
const STUB_TRANSACTIONS: Array<{ description: string; amount: string; daysAgo: number }> = [
  { description: 'Compra no mercado', amount: '-152.30', daysAgo: 1 },
  { description: 'Salario', amount: '5200.00', daysAgo: 2 },
  { description: 'Assinatura streaming', amount: '-39.90', daysAgo: 3 },
  { description: 'Restaurante', amount: '-88.00', daysAgo: 4 },
  { description: 'Reembolso', amount: '120.00', daysAgo: 5 },
];

/** Tamanho da pagina entregue pelo adaptador de desenvolvimento. */
const STUB_PAGE_SIZE = 2;

/**
 * Adaptador de desenvolvimento/teste do worker: devolve os mesmos lancamentos
 * fixos que o stub da API, paginados por deslocamento. Mantem a automacao
 * exercitavel ponta a ponta sem rede.
 */
export function createStubOpenFinanceTransactionProvider(): OpenFinanceTransactionProvider {
  return {
    async fetchTransactions(input: { externalId: string; cursor?: string | null }): Promise<ProviderTransactionPage> {
      const total = STUB_TRANSACTIONS.length;
      const start = cursorToOffset(input.cursor, total);
      const slice = STUB_TRANSACTIONS.slice(start, start + STUB_PAGE_SIZE);
      const next = start + slice.length;
      return {
        transactions: slice.map((item, offset) => ({
          externalId: `${input.externalId}:${start + offset}`,
          postedAt: daysAgo(item.daysAgo),
          description: item.description,
          amount: item.amount,
        })),
        nextCursor: String(next),
        hasMore: next < total,
      };
    },
  };
}

function cursorToOffset(cursor: string | null | undefined, total: number): number {
  if (!cursor) return 0;
  const parsed = Number(cursor);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.min(parsed, total);
}

/** Data (`YYYY-MM-DD`) de N dias atras, usada nos lancamentos do stub. */
function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Operacao gravada na auditoria da sincronizacao automatica. */
export const OPEN_FINANCE_AUTO_SYNC_OPERATION = 'openFinanceConsent.autoSync';
export const OPEN_FINANCE_ENTITY_TYPE = 'OpenFinanceConsent';

function toRecord(row: {
  id: string;
  financialSpaceId: string;
  institutionId: string;
  status: string;
  externalId: string | null;
  expiresAt: Date | null;
  targetAccountId: string | null;
  syncCursor: string | null;
  syncedExternalIds: string[];
}): OpenFinanceConsentRecord {
  return {
    id: row.id,
    financialSpaceId: row.financialSpaceId,
    institutionId: row.institutionId,
    status: row.status,
    externalId: row.externalId,
    expiresAt: row.expiresAt,
    targetAccountId: row.targetAccountId,
    syncCursor: row.syncCursor,
    syncedExternalIds: row.syncedExternalIds,
  };
}

/** Store da sync sobre o Prisma (mesmas tabelas que a API grava). */
export function createPrismaOpenFinanceSyncStore(prisma: PrismaClient): OpenFinanceSyncStore {
  return {
    findSyncableConsents: async () => {
      const rows = await prisma.openFinanceConsent.findMany({
        where: {
          status: 'authorized',
          externalId: { not: null },
          targetAccountId: { not: null },
        },
      });
      return rows.map(toRecord);
    },

    findConsent: async (id) => {
      const row = await prisma.openFinanceConsent.findUnique({ where: { id } });
      return row ? toRecord(row) : null;
    },

    findAccount: async (accountId) => {
      const row = await prisma.account.findUnique({
        where: { id: accountId },
        select: { id: true, currency: true },
      });
      return row ?? null;
    },

    applySync: async (input) =>
      prisma.$transaction(async (tx) => {
        let imported = 0;
        for (const item of input.transactions) {
          const type = directionForAmount(item.amount);
          const amount = signlessAmount(item.amount);
          const date = new Date(item.postedAt);
          await tx.transaction.create({
            data: {
              financialSpaceId: input.spaceId,
              type,
              status: 'confirmed',
              description: item.description,
              currency: input.account.currency,
              totalAmount: amount,
              effectiveDate: date,
              postings: {
                create: [
                  {
                    accountId: input.account.id,
                    amount,
                    direction: postingDirectionFor(type),
                    effectiveDate: date,
                  },
                ],
              },
            },
          });
          imported += 1;
        }

        await tx.openFinanceConsent.update({
          where: { id: input.consentId },
          data: {
            targetAccountId: input.account.id,
            syncCursor: input.cursor,
            lastSyncedAt: new Date(),
            syncedExternalIds: input.syncedIds,
            version: { increment: 1 },
          },
        });

        await tx.auditLog.create({
          data: {
            financialSpaceId: input.spaceId,
            operation: OPEN_FINANCE_AUTO_SYNC_OPERATION,
            entityType: OPEN_FINANCE_ENTITY_TYPE,
            entityId: input.consentId,
            safeSummary: {
              institutionId: input.institutionId,
              accountId: input.account.id,
              importedCount: imported,
              skippedCount: input.skippedCount,
              hasMore: input.hasMore,
            },
          },
        });

        return { importedCount: imported };
      }),
  };
}

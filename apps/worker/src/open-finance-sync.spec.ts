import { describe, expect, it, vi } from 'vitest';
import {
  createOpenFinanceSyncProcessor,
  type ApplySyncInput,
  type OpenFinanceConsentRecord,
  type OpenFinanceSyncAccount,
  type OpenFinanceSyncLogger,
  type OpenFinanceSyncStore,
  type OpenFinanceTransactionProvider,
} from './open-finance-sync';
import type { ProviderTransaction } from './domain/open-finance-sync';

const silencioso: OpenFinanceSyncLogger = { info: () => {}, warn: () => {}, error: () => {} };

const item = (n: number, amount = '-10.00'): ProviderTransaction => ({
  externalId: `ext-${n}`,
  postedAt: '2026-06-10',
  description: `Lancamento ${n}`,
  amount,
});

/** Provider paginado em memoria, opcionalmente falho para um `externalId`. */
function makeProvider(items: ProviderTransaction[], pageSize = 2, failFor?: string): OpenFinanceTransactionProvider {
  return {
    async fetchTransactions({ externalId, cursor }) {
      if (failFor && externalId === failFor) throw new Error('provedor indisponivel');
      const start = cursor ? Number(cursor) : 0;
      const slice = items.slice(start, start + pageSize);
      const next = start + slice.length;
      return { transactions: slice, nextCursor: String(next), hasMore: next < items.length };
    },
  };
}

/** Store em memoria: guarda o estado do consentimento entre chamadas. */
function makeStore(
  consents: OpenFinanceConsentRecord[],
  accounts: Record<string, OpenFinanceSyncAccount> = {},
) {
  const state = new Map(consents.map((c) => [c.id, { ...c, syncedExternalIds: [...c.syncedExternalIds] }]));
  const applySync = vi.fn(async (input: ApplySyncInput) => {
    const current = state.get(input.consentId);
    if (current) {
      current.syncCursor = input.cursor;
      current.syncedExternalIds = [...input.syncedIds];
    }
    return { importedCount: input.transactions.length };
  });
  const store: OpenFinanceSyncStore = {
    findSyncableConsents: async () => [...state.values()].map((c) => ({ ...c })),
    findConsent: async (id) => (state.has(id) ? { ...state.get(id)! } : null),
    findAccount: async (id) => accounts[id] ?? null,
    applySync,
  };
  return { store, applySync };
}

const consent = (over: Partial<OpenFinanceConsentRecord> = {}): OpenFinanceConsentRecord => ({
  id: 'c1',
  financialSpaceId: 's1',
  institutionId: 'banco-exemplo',
  status: 'authorized',
  externalId: 'ext-c1',
  expiresAt: new Date('2026-09-01T00:00:00.000Z'),
  targetAccountId: 'a1',
  syncCursor: null,
  syncedExternalIds: [],
  ...over,
});

const conta: OpenFinanceSyncAccount = { id: 'a1', currency: 'BRL' };
const fixedNow = () => new Date('2026-06-15T12:00:00.000Z');

describe('open-finance sync (processador do worker)', () => {
  it('importa os lancamentos novos em paginas e avanca o cursor', async () => {
    const { store, applySync } = makeStore([consent()], { a1: conta });
    const processor = createOpenFinanceSyncProcessor({
      store,
      provider: makeProvider([item(1), item(2), item(3), item(4), item(5)]),
      logger: silencioso,
      now: fixedNow,
    });

    const result = await processor.runAll();

    expect(result).toEqual({ consents: 1, importedCount: 5, skippedCount: 0, failedCount: 0 });
    expect(applySync).toHaveBeenCalledTimes(1);
    const input = applySync.mock.calls[0][0];
    expect(input.transactions.map((t) => t.externalId)).toEqual(['ext-1', 'ext-2', 'ext-3', 'ext-4', 'ext-5']);
    expect(input.cursor).toBe('5');
    expect(input.hasMore).toBe(false);
    expect(input.syncedIds).toEqual(['ext-1', 'ext-2', 'ext-3', 'ext-4', 'ext-5']);
  });

  it('e idempotente: reexecutar nao duplica lancamentos', async () => {
    const { store, applySync } = makeStore([consent()], { a1: conta });
    const processor = createOpenFinanceSyncProcessor({
      store,
      provider: makeProvider([item(1), item(2), item(3), item(4), item(5)]),
      logger: silencioso,
      now: fixedNow,
    });

    const first = await processor.runAll();
    const second = await processor.runAll();

    expect(first.importedCount).toBe(5);
    expect(second.importedCount).toBe(0);
    expect(applySync).toHaveBeenLastCalledWith(expect.objectContaining({ transactions: [] }));
  });

  it('conta como skipped o que ja estava sincronizado dentro da pagina', async () => {
    const { store, applySync } = makeStore(
      [consent({ syncCursor: '2', syncedExternalIds: ['ext-3'] })],
      { a1: conta },
    );
    const processor = createOpenFinanceSyncProcessor({
      store,
      provider: makeProvider([item(1), item(2), item(3), item(4), item(5)]),
      logger: silencioso,
      now: fixedNow,
    });

    const result = await processor.runAll();

    expect(result.importedCount).toBe(2);
    expect(result.skippedCount).toBe(1);
    expect(applySync.mock.calls[0][0].transactions.map((t) => t.externalId)).toEqual(['ext-4', 'ext-5']);
  });

  it('ignora consentimentos inelegiveis (nao autorizados ou expirados)', async () => {
    const { store, applySync } = makeStore(
      [
        consent({ id: 'pendente', status: 'pending' }),
        consent({ id: 'expirado', expiresAt: new Date('2026-06-01T00:00:00.000Z') }),
        consent({ id: 'sem-conta', targetAccountId: null }),
      ],
      { a1: conta },
    );
    const processor = createOpenFinanceSyncProcessor({
      store,
      provider: makeProvider([item(1)]),
      logger: silencioso,
      now: fixedNow,
    });

    const result = await processor.runAll();

    expect(result).toEqual({ consents: 3, importedCount: 0, skippedCount: 0, failedCount: 0 });
    expect(applySync).not.toHaveBeenCalled();
  });

  it('isola a falha de um provedor sem derrubar os demais', async () => {
    const { store, applySync } = makeStore(
      [consent({ id: 'c1', externalId: 'ext-c1' }), consent({ id: 'c2', externalId: 'ext-c2', targetAccountId: 'a1' })],
      { a1: conta },
    );
    const processor = createOpenFinanceSyncProcessor({
      store,
      provider: makeProvider([item(1), item(2)], 2, 'ext-c2'),
      logger: silencioso,
      now: fixedNow,
    });

    const result = await processor.runAll();

    expect(result.consents).toBe(2);
    expect(result.importedCount).toBe(2);
    expect(result.failedCount).toBe(1);
    expect(applySync).toHaveBeenCalledTimes(1);
  });

  it('syncConsent ignora consentimento inexistente', async () => {
    const { store } = makeStore([], {});
    const processor = createOpenFinanceSyncProcessor({
      store,
      provider: makeProvider([]),
      logger: silencioso,
      now: fixedNow,
    });

    const result = await processor.syncConsent('nao-existe');

    expect(result.handled).toBe(false);
    expect(result.reason).toBe('NOT_FOUND');
  });

  it('syncConsent recusa consentimento inelegivel', async () => {
    const { store } = makeStore([consent({ status: 'revoked' })], { a1: conta });
    const processor = createOpenFinanceSyncProcessor({
      store,
      provider: makeProvider([item(1)]),
      logger: silencioso,
      now: fixedNow,
    });

    const result = await processor.syncConsent('c1');

    expect(result.handled).toBe(false);
    expect(result.reason).toBe('NOT_SYNCABLE');
  });

  it('syncConsent ignora quando a conta de destino nao existe mais', async () => {
    const { store, applySync } = makeStore([consent()], {});
    const processor = createOpenFinanceSyncProcessor({
      store,
      provider: makeProvider([item(1)]),
      logger: silencioso,
      now: fixedNow,
    });

    const result = await processor.syncConsent('c1');

    expect(result.handled).toBe(false);
    expect(result.reason).toBe('ACCOUNT_NOT_FOUND');
    expect(applySync).not.toHaveBeenCalled();
  });
});

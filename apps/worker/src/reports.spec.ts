import { describe, expect, it, vi } from 'vitest';
import {
  createReportProcessor,
  REPORT_DONE,
  REPORT_PENDING,
  type ReportContent,
  type ReportJobRecord,
  type ReportLogger,
  type ReportStore,
} from './reports';
import type { ReportTransactionLike } from './domain/report';

const silencioso: ReportLogger = { info: () => {}, warn: () => {}, error: () => {} };

const job = (over: Partial<ReportJobRecord> = {}): ReportJobRecord => ({
  id: 'job-1',
  financialSpaceId: 'space-1',
  type: 'transactions_export',
  status: REPORT_PENDING,
  params: { from: '2026-11-01', to: '2026-11-30' },
  ...over,
});

const lancamento: ReportTransactionLike = {
  effectiveDate: new Date('2026-11-10T00:00:00.000Z'),
  type: 'expense',
  status: 'confirmed',
  description: 'Mercado',
  amount: '100.00',
  currency: 'BRL',
  categoryName: null,
  accountNames: ['Conta'],
};

/** Store em memoria que espelha o comportamento do store sobre o Prisma. */
function makeStore(options: {
  job?: ReportJobRecord | null;
  rows?: ReportTransactionLike[];
  failOnFind?: Error;
} = {}) {
  const { job: seed = job(), rows = [lancamento], failOnFind } = options;
  const markRunning = vi.fn(async (_id: string, _at: Date) => {});
  const markDone = vi.fn(async (_id: string, _at: Date, _content: ReportContent) => {});
  const markError = vi.fn(async (_id: string, _at: Date, _message: string) => {});
  const findTransactions = vi.fn(async () => {
    if (failOnFind) throw failOnFind;
    return rows;
  });

  const store: ReportStore = {
    findJob: async () => seed,
    markRunning,
    markDone,
    markError,
    findTransactions,
  };
  return { store, markRunning, markDone, markError, findTransactions };
}

describe('relatorio (processador do worker)', () => {
  it('gera o relatorio de um job pendente e guarda o CSV em cache', async () => {
    const { store, markRunning, markDone } = makeStore();
    const processor = createReportProcessor({
      store,
      logger: silencioso,
      now: () => new Date('2026-11-21T12:00:00Z'),
    });

    const result = await processor.process({ jobId: 'job-1' });

    expect(result).toEqual({ handled: true });
    expect(markRunning).toHaveBeenCalledWith('job-1', new Date('2026-11-21T12:00:00Z'));
    const [, , content] = markDone.mock.calls[0];
    expect(content).toMatchObject({
      fileName: 'transacoes-2026-11-01_2026-11-30.csv',
      contentType: 'text/csv; charset=utf-8',
      rowCount: 1,
    });
    expect(content.content).toContain('Mercado');
  });

  it('ignora um job ja resolvido (idempotencia na reentrega do evento)', async () => {
    const { store, markRunning, markDone } = makeStore({ job: job({ status: REPORT_DONE }) });
    const processor = createReportProcessor({ store, logger: silencioso });

    expect(await processor.process({ jobId: 'job-1' })).toEqual({ handled: false });
    expect(markRunning).not.toHaveBeenCalled();
    expect(markDone).not.toHaveBeenCalled();
  });

  it('ignora evento sem jobId e job inexistente', async () => {
    const processor = createReportProcessor({ store: makeStore().store, logger: silencioso });
    expect(await processor.process({})).toEqual({ handled: false });

    const semJob = createReportProcessor({ store: makeStore({ job: null }).store, logger: silencioso });
    expect(await semJob.process({ jobId: 'nao-existe' })).toEqual({ handled: false });
  });

  it('marca como error (sem propagar) quando a geracao falha', async () => {
    const { store, markError, markDone } = makeStore({ failOnFind: new Error('banco fora do ar') });
    const processor = createReportProcessor({
      store,
      logger: silencioso,
      now: () => new Date('2026-11-21T12:00:00Z'),
    });

    const result = await processor.process({ jobId: 'job-1' });

    expect(result).toEqual({ handled: true });
    expect(markDone).not.toHaveBeenCalled();
    expect(markError).toHaveBeenCalledWith('job-1', new Date('2026-11-21T12:00:00Z'), 'banco fora do ar');
  });
});

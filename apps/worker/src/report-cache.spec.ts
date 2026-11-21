import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_REPORT_RETENTION_DAYS,
  createReportCacheProcessor,
  type ReportCacheLogger,
  type ReportCacheStore,
} from './report-cache';

const silencioso: ReportCacheLogger = { info: () => {}, warn: () => {}, error: () => {} };

/** Store em memoria que guarda os ids "finalizados" e registra a remocao. */
function makeStore(expired: string[] = []) {
  const deleteJobs = vi.fn(async (ids: string[]) => ids.length);
  const findFinishedBefore = vi.fn(async () => expired);
  const store: ReportCacheStore = { findFinishedBefore, deleteJobs };
  return { store, findFinishedBefore, deleteJobs };
}

describe('report cache (processador do worker)', () => {
  it('apaga as entradas finalizadas antes do corte de retencao', async () => {
    const { store, findFinishedBefore, deleteJobs } = makeStore(['job-1', 'job-2']);
    const processor = createReportCacheProcessor({
      store,
      logger: silencioso,
      now: () => new Date('2026-11-21T12:00:00.000Z'),
    });

    const result = await processor.prune();

    expect(result.deleted).toBe(2);
    expect(result.cutoff).toEqual(new Date('2026-11-14T12:00:00.000Z'));
    expect(findFinishedBefore).toHaveBeenCalledWith(new Date('2026-11-14T12:00:00.000Z'));
    expect(deleteJobs).toHaveBeenCalledWith(['job-1', 'job-2']);
  });

  it('nao apaga nada quando nao ha entradas expiradas', async () => {
    const { store, deleteJobs } = makeStore([]);
    const processor = createReportCacheProcessor({ store, logger: silencioso, now: () => new Date('2026-11-21T12:00:00.000Z') });

    const result = await processor.prune();

    expect(result.deleted).toBe(0);
    expect(deleteJobs).not.toHaveBeenCalled();
  });

  it('respeita a janela de retencao informada', async () => {
    const { store, findFinishedBefore } = makeStore([]);
    const processor = createReportCacheProcessor({
      store,
      logger: silencioso,
      now: () => new Date('2026-11-21T00:00:00.000Z'),
      retentionDays: 1,
    });

    await processor.prune();

    expect(findFinishedBefore).toHaveBeenCalledWith(new Date('2026-11-20T00:00:00.000Z'));
  });

  it('usa 7 dias de retencao por padrao', () => {
    expect(DEFAULT_REPORT_RETENTION_DAYS).toBe(7);
  });
});

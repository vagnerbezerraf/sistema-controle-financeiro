/**
 * Manutencao do cache de relatorios no worker (Fase 5).
 *
 * O worker guarda o CSV gerado na propria linha do job (`ReportJob.result`).
 * Este job periodico **evicta as entradas expiradas**: apaga os jobs ja
 * finalizados (`done`/`error`) mais antigos que a janela de retencao, liberando
 * o conteudo guardado. A decisao vive aqui e a persistencia fica atras de um
 * store injetavel — o mesmo desenho dos outros canais — testavel sem banco.
 */
import type { PrismaClient } from '@prisma/client';

/** Situacoes em que o job ja produziu desfecho (podem ser evictadas). */
export const REPORT_FINISHED_STATUSES = ['done', 'error'] as const;

/** Janela de retencao do cache (dias), contada a partir do `finishedAt`. */
export const DEFAULT_REPORT_RETENTION_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Abstrai a persistencia do cache (implementado sobre o Prisma). */
export interface ReportCacheStore {
  /** Ids dos jobs finalizados antes do corte. */
  findFinishedBefore(cutoff: Date): Promise<string[]>;
  /** Remove os jobs indicados e devolve quantos foram apagados. */
  deleteJobs(ids: string[]): Promise<number>;
}

/** Logger minimo aceito pelo processador (compativel com o pino do worker). */
export interface ReportCacheLogger {
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
  error(obj: Record<string, unknown>, msg: string): void;
}

export interface ReportCacheProcessorDeps {
  store: ReportCacheStore;
  logger: ReportCacheLogger;
  /** Injetavel para testes; padrao = relogio do sistema. */
  now?: () => Date;
  retentionDays?: number;
}

export interface ReportCacheResult {
  cutoff: Date;
  deleted: number;
}

export interface ReportCacheProcessor {
  /**
   * Remove as entradas de cache expiradas. Repetivel sem efeito colateral. A
   * janela pode ser sobreposta por execucao (pedido pontual).
   */
  prune(overrideRetentionDays?: number): Promise<ReportCacheResult>;
}

/**
 * Evicta o cache: apaga os jobs finalizados antes de `agora - retencao`. Sem
 * nada expirado, nada e apagado — reexecutar o job e inofensivo.
 */
export function createReportCacheProcessor(deps: ReportCacheProcessorDeps): ReportCacheProcessor {
  const now = deps.now ?? (() => new Date());
  const retentionDays = deps.retentionDays ?? DEFAULT_REPORT_RETENTION_DAYS;

  return {
    async prune(overrideRetentionDays?: number): Promise<ReportCacheResult> {
      const days = overrideRetentionDays ?? retentionDays;
      const cutoff = new Date(now().getTime() - days * DAY_MS);
      const ids = await deps.store.findFinishedBefore(cutoff);
      const deleted = ids.length > 0 ? await deps.store.deleteJobs(ids) : 0;
      deps.logger.info({ cutoff: cutoff.toISOString(), deleted, retentionDays: days }, 'Cache de relatorios evictado');
      return { cutoff, deleted };
    },
  };
}

/** Store do cache sobre o Prisma (mesma tabela que a API e o processor gravam). */
export function createPrismaReportCacheStore(prisma: PrismaClient): ReportCacheStore {
  return {
    findFinishedBefore: async (cutoff) => {
      const rows = await prisma.reportJob.findMany({
        where: { status: { in: [...REPORT_FINISHED_STATUSES] }, finishedAt: { lt: cutoff } },
        select: { id: true },
      });
      return rows.map((row) => row.id);
    },

    deleteJobs: async (ids) => {
      const result = await prisma.reportJob.deleteMany({ where: { id: { in: ids } } });
      return result.count;
    },
  };
}

/**
 * Geracao de relatorios no worker (Fase 5).
 *
 * O worker drena o outbox e, ao encontrar o evento `report.requested`, produz o
 * relatorio do job correspondente e o deixa em cache na propria linha. A logica
 * de decisao vive aqui, com a persistencia atras de um store injetavel — o
 * mesmo desenho do drainer do outbox — para ser testavel sem banco.
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import {
  buildTransactionsCsv,
  MAX_REPORT_ROWS,
  reportFileName,
  truncateError,
  type ReportParamsLike,
  type ReportTransactionLike,
} from './domain/report';

/** Situacoes do job (espelham o enum `ReportJobStatus` do schema). */
export const REPORT_PENDING = 'pending';
export const REPORT_RUNNING = 'running';
export const REPORT_DONE = 'done';
export const REPORT_ERROR = 'error';

/** Linha do job com os campos que a geracao consome. */
export interface ReportJobRecord {
  id: string;
  financialSpaceId: string;
  type: string;
  status: string;
  params: ReportParamsLike;
}

/** Conteudo produzido e guardado em cache no job. */
export interface ReportContent {
  fileName: string;
  contentType: string;
  content: string;
  rowCount: number;
}

/** Abstrai a persistencia do relatorio (implementado sobre o Prisma). */
export interface ReportStore {
  findJob(id: string): Promise<ReportJobRecord | null>;
  markRunning(id: string, at: Date): Promise<void>;
  markDone(id: string, at: Date, content: ReportContent): Promise<void>;
  markError(id: string, at: Date, message: string): Promise<void>;
  findTransactions(spaceId: string, params: ReportParamsLike): Promise<ReportTransactionLike[]>;
}

/** Logger minimo aceito pelo processador (compativel com o pino do worker). */
export interface ReportLogger {
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
  error(obj: Record<string, unknown>, msg: string): void;
}

export interface ReportProcessorDeps {
  store: ReportStore;
  logger: ReportLogger;
  /** Injetavel para testes; padrao = relogio do sistema. */
  now?: () => Date;
}

export interface ReportProcessor {
  /** Processa o job do evento. Idempotente: um job ja resolvido e ignorado. */
  process(payload: { jobId?: string }): Promise<{ handled: boolean }>;
}

/**
 * Processa um pedido de relatorio. Um job so e gerado uma vez: se o evento for
 * reentregue (retry do outbox), o status ja nao e mais `pending` e nada e
 * refeito. Uma falha de geracao marca o job como `error` e NAO propaga — nao ha
 * o que ganhar reprocessando um pedido que ja tem desfecho registrado.
 */
export function createReportProcessor(deps: ReportProcessorDeps): ReportProcessor {
  const now = deps.now ?? (() => new Date());

  return {
    async process(payload: { jobId?: string }): Promise<{ handled: boolean }> {
      const jobId = payload?.jobId;
      if (!jobId) {
        deps.logger.warn({}, 'Evento de relatorio sem jobId');
        return { handled: false };
      }

      const job = await deps.store.findJob(jobId);
      if (!job) {
        deps.logger.warn({ jobId }, 'Job de relatorio nao encontrado');
        return { handled: false };
      }
      if (job.status !== REPORT_PENDING) {
        deps.logger.info({ jobId, status: job.status }, 'Job de relatorio ja resolvido');
        return { handled: false };
      }

      await deps.store.markRunning(jobId, now());

      try {
        const rows = await deps.store.findTransactions(job.financialSpaceId, job.params);
        const content = buildTransactionsCsv(rows);
        await deps.store.markDone(jobId, now(), {
          fileName: reportFileName(job.params),
          contentType: 'text/csv; charset=utf-8',
          content,
          rowCount: rows.length,
        });
        deps.logger.info({ jobId, rowCount: rows.length }, 'Relatorio gerado');
        return { handled: true };
      } catch (err) {
        const message = truncateError(err instanceof Error ? err.message : String(err));
        await deps.store.markError(jobId, now(), message);
        deps.logger.error({ jobId, message }, 'Falha ao gerar relatorio');
        return { handled: true };
      }
    },
  };
}

/** Inicio do dia em UTC, referencial das colunas `@db.Date`. */
function startOfUtcDay(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

/** Store do relatorio sobre o Prisma (mesma tabela que a API grava). */
export function createPrismaReportStore(prisma: PrismaClient): ReportStore {
  return {
    findJob: async (id) => {
      const row = await prisma.reportJob.findUnique({
        where: { id },
        select: { id: true, financialSpaceId: true, type: true, status: true, params: true },
      });
      if (!row) return null;
      const params = (row.params ?? {}) as Record<string, unknown>;
      return {
        id: row.id,
        financialSpaceId: row.financialSpaceId,
        type: row.type,
        status: row.status,
        params: {
          from: typeof params.from === 'string' ? params.from : undefined,
          to: typeof params.to === 'string' ? params.to : undefined,
        },
      };
    },

    markRunning: async (id, at) => {
      await prisma.reportJob.update({
        where: { id },
        data: { status: REPORT_RUNNING, startedAt: at, error: null },
      });
    },

    markDone: async (id, at, content) => {
      await prisma.reportJob.update({
        where: { id },
        data: {
          status: REPORT_DONE,
          result: content as unknown as Prisma.InputJsonValue,
          rowCount: content.rowCount,
          error: null,
          finishedAt: at,
        },
      });
    },

    markError: async (id, at, message) => {
      await prisma.reportJob.update({
        where: { id },
        data: { status: REPORT_ERROR, error: message, finishedAt: at },
      });
    },

    findTransactions: async (spaceId, params) => {
      const range: { gte?: Date; lte?: Date } = {};
      if (params.from) range.gte = startOfUtcDay(params.from);
      if (params.to) range.lte = startOfUtcDay(params.to);

      const rows = await prisma.transaction.findMany({
        where: {
          financialSpaceId: spaceId,
          ...(params.from || params.to ? { effectiveDate: range } : {}),
        },
        orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
        take: MAX_REPORT_ROWS,
        include: {
          category: { select: { name: true } },
          postings: { include: { account: { select: { name: true } } } },
        },
      });

      return rows.map((row) => ({
        effectiveDate: row.effectiveDate,
        type: row.type,
        status: row.status,
        description: row.description,
        amount: row.totalAmount.toFixed(2),
        currency: row.currency,
        categoryName: row.category?.name ?? null,
        accountNames: row.postings.map((posting) => posting.account.name),
      }));
    },
  };
}

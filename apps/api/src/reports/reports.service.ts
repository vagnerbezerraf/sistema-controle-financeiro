import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaClient, type ReportJob as ReportJobRow } from '@prisma/client';
import type { ReportJob, ReportJobParams } from '@scf/api-contracts';
import { OutboxService } from '../outbox/outbox.service';
import {
  canDownload,
  isPeriodOrdered,
  isPeriodWithinLimit,
  MAX_PERIOD_DAYS,
  normalizePeriod,
  REPORT_JOB_LIST_LIMIT,
  REPORT_REQUESTED_EVENT,
} from './domain/report-job';
import type { CreateReportJobRequest } from './http/dto';

/** Conteudo gerado pelo worker e guardado em cache no job (`result`). */
export interface ReportJobResult {
  fileName: string;
  contentType: string;
  content: string;
  rowCount: number;
}

/** Baixa o conteudo do relatorio pronto (usado pelo controller). */
export interface ReportDownload {
  fileName: string;
  contentType: string;
  content: string;
}

/** Le os parametros gravados em JSON com um minimo de tolerancia a formato. */
function readParams(value: Prisma.JsonValue): ReportJobParams {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const raw = value as Record<string, unknown>;
    return {
      from: typeof raw.from === 'string' ? raw.from : undefined,
      to: typeof raw.to === 'string' ? raw.to : undefined,
    };
  }
  return {};
}

/** Converte a linha do banco para a visao publica da API. */
function toView(row: ReportJobRow): ReportJob {
  return {
    id: row.id,
    financialSpaceId: row.financialSpaceId,
    type: row.type,
    status: row.status,
    params: readParams(row.params),
    rowCount: row.rowCount,
    error: row.error,
    requestedBy: row.requestedBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
  };
}

/**
 * Relatorios assincronos (Fase 5).
 *
 * Pedir um relatorio e uma escrita barata: grava o job como `pending` e um
 * evento no outbox na MESMA transacao (garantia do padrao outbox — se a gravacao
 * falhar, nao sobra evento; se o processo cair depois, o worker reprocessa).
 * O conteudo e produzido em background pelo worker e fica em cache no proprio
 * job ate ser baixado. Esta camada apenas persiste, lista e entrega.
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly outbox: OutboxService,
  ) {}

  async create(spaceId: string, body: CreateReportJobRequest, userId: string): Promise<ReportJob> {
    const period = normalizePeriod({ from: body.from, to: body.to });
    if (!isPeriodOrdered(period)) {
      throw new BadRequestException({
        code: 'INVALID_PERIOD',
        message: 'A data inicial nao pode ser posterior a final',
      });
    }
    if (!isPeriodWithinLimit(period)) {
      throw new BadRequestException({
        code: 'PERIOD_TOO_LONG',
        message: `O periodo nao pode passar de ${MAX_PERIOD_DAYS} dias`,
      });
    }

    const job = await this.prisma.$transaction(async (tx) => {
      const created = await tx.reportJob.create({
        data: {
          financialSpaceId: spaceId,
          type: body.type,
          params: period as unknown as Prisma.InputJsonValue,
          requestedBy: userId,
        },
      });
      await this.outbox.record(tx, {
        financialSpaceId: spaceId,
        eventType: REPORT_REQUESTED_EVENT,
        payload: { jobId: created.id, type: created.type },
      });
      return created;
    });

    return toView(job);
  }

  /** Jobs mais recentes primeiro; o historico e limitado para nao crescer sem fim. */
  async list(spaceId: string): Promise<ReportJob[]> {
    const rows = await this.prisma.reportJob.findMany({
      where: { financialSpaceId: spaceId },
      orderBy: { createdAt: 'desc' },
      take: REPORT_JOB_LIST_LIMIT,
    });
    return rows.map(toView);
  }

  async get(spaceId: string, jobId: string): Promise<ReportJob> {
    const row = await this.prisma.reportJob.findFirst({
      where: { id: jobId, financialSpaceId: spaceId },
    });
    if (!row) throw new NotFoundException('Relatorio nao encontrado');
    return toView(row);
  }

  /** Entrega o conteudo em cache; recusa enquanto o job nao terminou. */
  async download(spaceId: string, jobId: string): Promise<ReportDownload> {
    const row = await this.prisma.reportJob.findFirst({
      where: { id: jobId, financialSpaceId: spaceId },
    });
    if (!row) throw new NotFoundException('Relatorio nao encontrado');
    if (!canDownload(row.status)) {
      throw new ConflictException({
        code: 'REPORT_NOT_READY',
        message: 'O relatorio ainda nao esta pronto',
        status: row.status,
      });
    }

    const result = row.result as unknown as ReportJobResult | null;
    if (!result) {
      throw new ConflictException({
        code: 'REPORT_NOT_READY',
        message: 'O relatorio ainda nao esta pronto',
        status: row.status,
      });
    }

    return { fileName: result.fileName, contentType: result.contentType, content: result.content };
  }
}

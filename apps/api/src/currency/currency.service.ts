import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CurrencyCode, Prisma, PrismaClient, type ExchangeRate as ExchangeRateRow } from '@prisma/client';
import type { ExchangeRate } from '@scf/api-contracts';
import { startOfUtcDay } from '../common/utils/date';
import { updateWithOptimisticLock } from '../common/utils/optimistic-lock';
import { isValidRate, toIsoDay, type ExchangeRateInput } from './domain/exchange-rate';
import type { CreateExchangeRateRequest, UpdateExchangeRateRequest } from './http/dto';

const DEFAULT_CURRENCY: CurrencyCode = 'BRL';

/** Converte a linha do banco para a visao publica da API. */
function toView(row: ExchangeRateRow): ExchangeRate {
  return {
    id: row.id,
    financialSpaceId: row.financialSpaceId,
    fromCurrency: row.fromCurrency,
    toCurrency: row.toCurrency,
    rate: row.rate.toString(),
    asOf: toIsoDay(row.asOf.toISOString()),
    source: row.source,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    version: row.version,
  };
}

/** Contexto de conversao de um espaco: moeda de reporte + tabela de taxas. */
export interface CurrencyContext {
  baseCurrency: CurrencyCode;
  rates: ExchangeRateInput[];
}

/**
 * Multiplas moedas (Fase 5): CRUD das taxas de cambio de um espaco financeiro e
 * a leitura, em uma unica consulta, do contexto de conversao (`moeda de reporte
 * + tabela de taxas`) usado pelos totais consolidados. A resolucao da taxa em si
 * vive no dominio puro (`domain/exchange-rate`); aqui so ha persistencia,
 * validacao e auditoria.
 */
@Injectable()
export class CurrencyService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(spaceId: string): Promise<ExchangeRate[]> {
    const rows = await this.prisma.exchangeRate.findMany({
      where: { financialSpaceId: spaceId },
      orderBy: [{ fromCurrency: 'asc' }, { toCurrency: 'asc' }, { asOf: 'desc' }],
    });
    return rows.map(toView);
  }

  async create(spaceId: string, body: CreateExchangeRateRequest, userId: string): Promise<ExchangeRate> {
    this.assertPair(body.fromCurrency, body.toCurrency);
    this.assertRate(body.rate);

    const asOf = startOfUtcDay(body.asOf ?? new Date());
    await this.assertNoDuplicate(spaceId, body.fromCurrency, body.toCurrency, asOf);

    const row = await this.prisma.exchangeRate.create({
      data: {
        financialSpaceId: spaceId,
        fromCurrency: body.fromCurrency,
        toCurrency: body.toCurrency,
        rate: body.rate,
        asOf,
        source: body.source,
      },
    });

    await this.audit(spaceId, userId, 'exchangeRate.create', row.id, {
      fromCurrency: row.fromCurrency,
      toCurrency: row.toCurrency,
      rate: row.rate.toString(),
      asOf: toIsoDay(row.asOf.toISOString()),
    });
    return toView(row);
  }

  async update(
    spaceId: string,
    rateId: string,
    body: UpdateExchangeRateRequest,
    userId: string,
  ): Promise<ExchangeRate> {
    const existing = await this.prisma.exchangeRate.findFirst({
      where: { id: rateId, financialSpaceId: spaceId },
    });
    if (!existing) throw new NotFoundException('Taxa de cambio nao encontrada');
    if (body.rate !== undefined) this.assertRate(body.rate);

    const asOf = body.asOf !== undefined ? startOfUtcDay(body.asOf) : existing.asOf;
    // O par nao muda; so a data/valor. Se a nova data colidir com outra linha,
    // recusa antes de tentar o UPDATE (mensagem mais clara que o P2002).
    if (toIsoDay(asOf.toISOString()) !== toIsoDay(existing.asOf.toISOString())) {
      await this.assertNoDuplicate(spaceId, existing.fromCurrency, existing.toCurrency, asOf, rateId);
    }

    const { version, ...rest } = body;
    const data: Prisma.ExchangeRateUpdateInput = {};
    if (rest.rate !== undefined) data.rate = rest.rate;
    if (rest.asOf !== undefined) data.asOf = startOfUtcDay(rest.asOf);
    if (rest.source !== undefined) data.source = rest.source;

    const scope = { id: rateId, financialSpaceId: spaceId };
    const updated = await updateWithOptimisticLock<ExchangeRateRow>({
      applyConditionalUpdate: async () => {
        const res = await this.prisma.exchangeRate.updateMany({
          where: version === undefined ? scope : { ...scope, version },
          data: { ...data, version: { increment: 1 } },
        });
        return res.count;
      },
      exists: async () => (await this.prisma.exchangeRate.count({ where: scope })) > 0,
      reload: () => this.prisma.exchangeRate.findUniqueOrThrow({ where: { id: rateId } }),
      notFoundMessage: 'Taxa de cambio nao encontrada',
      staleMessage: 'Taxa foi alterada por outra sessao; recarregue e tente novamente',
    });

    await this.audit(spaceId, userId, 'exchangeRate.update', rateId, {
      fromCurrency: updated.fromCurrency,
      toCurrency: updated.toCurrency,
      rate: updated.rate.toString(),
      asOf: toIsoDay(updated.asOf.toISOString()),
    });
    return toView(updated);
  }

  async remove(spaceId: string, rateId: string, userId: string): Promise<{ deleted: true }> {
    const existing = await this.prisma.exchangeRate.findFirst({
      where: { id: rateId, financialSpaceId: spaceId },
    });
    if (!existing) throw new NotFoundException('Taxa de cambio nao encontrada');

    await this.prisma.exchangeRate.delete({ where: { id: rateId } });
    await this.audit(spaceId, userId, 'exchangeRate.remove', rateId, {
      fromCurrency: existing.fromCurrency,
      toCurrency: existing.toCurrency,
      asOf: toIsoDay(existing.asOf.toISOString()),
    });
    return { deleted: true };
  }

  /** Moeda de reporte do espaco (fallback `BRL` quando o espaco nao existe). */
  async getBaseCurrency(spaceId: string): Promise<CurrencyCode> {
    const space = await this.prisma.financialSpace.findUnique({
      where: { id: spaceId },
      select: { primaryCurrency: true },
    });
    return space?.primaryCurrency ?? DEFAULT_CURRENCY;
  }

  /**
   * Le, em uma unica consulta, a moeda de reporte e a tabela de taxas do espaco.
   * O chamador reaproveita as taxas para converter N valores com a mesma data.
   */
  async loadContext(spaceId: string): Promise<CurrencyContext> {
    const [space, rows] = await Promise.all([
      this.prisma.financialSpace.findUnique({
        where: { id: spaceId },
        select: { primaryCurrency: true },
      }),
      this.prisma.exchangeRate.findMany({
        where: { financialSpaceId: spaceId },
        select: { fromCurrency: true, toCurrency: true, rate: true, asOf: true },
      }),
    ]);
    return {
      baseCurrency: space?.primaryCurrency ?? DEFAULT_CURRENCY,
      rates: rows.map((row) => ({
        fromCurrency: row.fromCurrency,
        toCurrency: row.toCurrency,
        rate: row.rate.toString(),
        asOf: toIsoDay(row.asOf.toISOString()),
      })),
    };
  }

  private assertPair(from: CurrencyCode, to: CurrencyCode): void {
    if (from === to) {
      throw new BadRequestException({
        code: 'INVALID_CURRENCY_PAIR',
        message: 'As moedas de origem e destino devem ser diferentes',
      });
    }
  }

  private assertRate(rate: string): void {
    if (!isValidRate(rate)) {
      throw new BadRequestException({
        code: 'INVALID_RATE',
        message: 'A taxa de cambio deve ser um decimal positivo com ate 4 casas',
      });
    }
  }

  /** Garante unicidade do par na data (a base tem unique nesses tres campos). */
  private async assertNoDuplicate(
    spaceId: string,
    from: CurrencyCode,
    to: CurrencyCode,
    asOf: Date,
    ignoreId?: string,
  ): Promise<void> {
    const duplicate = await this.prisma.exchangeRate.findFirst({
      where: {
        financialSpaceId: spaceId,
        fromCurrency: from,
        toCurrency: to,
        asOf,
        ...(ignoreId ? { id: { not: ignoreId } } : {}),
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException({
        code: 'DUPLICATE_RATE',
        message: 'Ja existe uma taxa para este par na mesma data',
      });
    }
  }

  private async audit(
    spaceId: string,
    userId: string,
    operation: string,
    entityId: string,
    safeSummary: Prisma.InputJsonValue,
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        financialSpaceId: spaceId,
        userId,
        operation,
        entityType: 'ExchangeRate',
        entityId,
        safeSummary,
      },
    });
  }
}

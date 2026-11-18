import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Prisma, PrismaClient, Transaction, TransactionStatus, TransactionType } from '@prisma/client';
import {
  JwtAuthGuard,
  Roles,
  SpaceRoleGuard,
  CurrentUser,
  type AuthenticatedUser,
} from '../common/auth/auth.guard';
import { CreateTransactionRequest, ReverseTransactionRequest } from './http/dto';
import { toDate } from '../common/utils/date';
import { toCsv } from '../common/utils/csv';

/** Teto de linhas da exportacao, para nao gerar um CSV ilimitado. */
const EXPORT_ROW_LIMIT = 10_000;

/** Nome do arquivo baixado, derivado do periodo filtrado. */
function exportFileName(from?: string, to?: string): string {
  const range = [from, to].filter(Boolean).join('_');
  return range ? `transacoes-${range}.csv` : 'transacoes.csv';
}

@ApiTags('transactions')
@Controller('financial-spaces/:spaceId/transactions')
@UseGuards(JwtAuthGuard, SpaceRoleGuard)
@ApiBearerAuth('access-token')
export class TransactionsController {
  constructor(private readonly prisma: PrismaClient) {}

  @Get()
  @Roles(['owner', 'admin', 'contributor', 'viewer'])
  @ApiOperation({ summary: 'Listar transacoes do espaco financeiro com paginacao cursor' })
  async list(
    @Param('spaceId') spaceId: string,
    @Query('limit') limitParam?: string,
    @Query('cursor') cursor?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('accountId') accountId?: string,
    @Query('categoryId') categoryId?: string,
    @Query('q') q?: string,
    @Query('tag') tag?: string,
  ) {
    const limit = Math.min(Number(limitParam ?? 50), 200);
    const where = this.buildTransactionFilter(spaceId, { from, to, type, status, accountId, categoryId, q, tag });
    if (cursor) where.id = { lt: cursor };

    const [items, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        take: limit + 1,
        orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
        include: { postings: true, category: { select: { name: true, color: true, type: true } } },
      }),
      this.prisma.transaction.count({ where }),
    ]);
    const hasNext = items.length > limit;
    const returned = hasNext ? items.slice(0, -1) : items;
    return {
      items: returned,
      total,
      nextCursor: hasNext ? returned[returned.length - 1].id : undefined,
    };
  }

  @Get('export')
  @Roles(['owner', 'admin', 'contributor', 'viewer'])
  @ApiOperation({ summary: 'Exportar transacoes em CSV (mesmos filtros da listagem)' })
  async export(
    @Param('spaceId') spaceId: string,
    @Res({ passthrough: true }) res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('accountId') accountId?: string,
    @Query('categoryId') categoryId?: string,
    @Query('q') q?: string,
    @Query('tag') tag?: string,
  ): Promise<string> {
    const where = this.buildTransactionFilter(spaceId, { from, to, type, status, accountId, categoryId, q, tag });
    const items = await this.prisma.transaction.findMany({
      where,
      orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
      take: EXPORT_ROW_LIMIT,
      include: {
        category: { select: { name: true } },
        postings: { include: { account: { select: { name: true } } } },
      },
    });

    const rows: Array<Array<unknown>> = [
      ['data', 'tipo', 'situacao', 'descricao', 'categoria', 'contas', 'valor', 'moeda'],
      ...items.map((t) => [
        t.effectiveDate.toISOString().slice(0, 10),
        t.type,
        t.status,
        t.description,
        t.category?.name ?? '',
        t.postings.map((p) => p.account.name).join(' | '),
        t.totalAmount.toFixed(2),
        t.currency,
      ]),
    ];

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${exportFileName(from, to)}"`);
    // O BOM faz o Excel reconhecer o UTF-8 e exibir os acentos corretamente.
    return `\uFEFF${toCsv(rows)}`;
  }

  @Post()
  @Roles(['owner', 'admin', 'contributor'])
  @ApiOperation({ summary: 'Criar transacao (receita, despesa, transferencia, ajuste)' })
  async create(
    @Param('spaceId') spaceId: string,
    @Body() body: CreateTransactionRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    this.validatePostings(body);

    if (idempotencyKey) {
      const existing = await this.prisma.idempotencyRecord.findUnique({
        where: { financialSpaceId_idempotencyKey: { financialSpaceId: spaceId, idempotencyKey } },
      });
      if (existing) return existing.responsePayload;
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const trx = await tx.transaction.create({
        data: {
          financialSpaceId: spaceId,
          type: body.type,
          status: body.status ?? 'confirmed',
          description: body.description,
          notes: body.notes,
          categoryId: body.categoryId,
          currency: body.currency ?? 'BRL',
          totalAmount: body.totalAmount,
          effectiveDate: toDate(body.effectiveDate),
          dueDate: body.dueDate ? toDate(body.dueDate) : undefined,
          tags: body.tags ?? [],
          idempotencyKey,
          postings: {
            create: body.postings.map((p) => ({
              accountId: p.accountId,
              amount: p.amount,
              direction: p.direction,
              effectiveDate: toDate(p.effectiveDate ?? body.effectiveDate),
            })),
          },
        },
        include: { postings: true, category: true },
      });

      if (idempotencyKey) {
        const fp = JSON.stringify(body).slice(0, 512);
        await tx.idempotencyRecord.create({
          data: {
            financialSpaceId: spaceId,
            idempotencyKey,
            requestFingerprint: fp,
            responsePayload: trx as any,
            expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
          },
        });
      }
      return trx;
    });
    return result;
  }

  @Get(':transactionId')
  @Roles(['owner', 'admin', 'contributor', 'viewer'])
  @ApiOperation({ summary: 'Detalhes da transacao' })
  async detail(@Param('spaceId') spaceId: string, @Param('transactionId') transactionId: string) {
    const trx = await this.prisma.transaction.findUnique({
      where: { id: transactionId, financialSpaceId: spaceId },
      include: { postings: { include: { account: { select: { id: true, name: true } } } }, category: true },
    });
    if (!trx) throw new NotFoundException('Transacao nao encontrada');
    return trx;
  }

  @Delete(':transactionId')
  @Roles(['owner', 'admin', 'contributor'])
  @ApiOperation({ summary: 'Cancelar transacao (exclusao logica via status)' })
  async cancel(@Param('spaceId') spaceId: string, @Param('transactionId') transactionId: string): Promise<Transaction> {
    const trx = await this.prisma.transaction.findUnique({ where: { id: transactionId, financialSpaceId: spaceId } });
    if (!trx) throw new NotFoundException('Transacao nao encontrada');
    return this.prisma.transaction.update({ where: { id: transactionId }, data: { status: 'canceled' } });
  }

  @Post(':transactionId/reverse')
  @Roles(['owner', 'admin', 'contributor'])
  @ApiOperation({ summary: 'Estornar transacao (cria transacao de estorno vinculada)' })
  async reverse(
    @Param('spaceId') spaceId: string,
    @Param('transactionId') transactionId: string,
    @Body() body: ReverseTransactionRequest,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Transaction> {
    const original = await this.prisma.transaction.findUnique({
      where: { id: transactionId, financialSpaceId: spaceId },
      include: { postings: true },
    });
    if (!original) throw new NotFoundException('Transacao nao encontrada');
    if (original.status !== 'confirmed') {
      throw new BadRequestException({
        code: 'INVALID_TRANSACTION_STATUS',
        message: 'Somente transacoes confirmadas podem ser estornadas',
      });
    }
    if (original.reversalOfTransactionId) {
      throw new BadRequestException({
        code: 'CANNOT_REVERSE_REVERSAL',
        message: 'Uma transacao de estorno nao pode ser estornada',
      });
    }
    if (original.reversedAt) {
      throw new BadRequestException({
        code: 'ALREADY_REVERSED',
        message: 'Transacao ja foi estornada',
      });
    }

    // A competencia do estorno e, por padrao, a mesma do original, para que o
    // efeito nos totais fique zerado no mes correto. Pode ser sobrescrita.
    const effectiveDate = toDate(body.effectiveDate ?? original.effectiveDate.toISOString().slice(0, 10));

    return this.prisma.$transaction(async (tx) => {
      // O estorno e uma transacao compensatoria: mesmo tipo do original, valor
      // negativo e movimentos com a direcao invertida. Assim o efeito liquido
      // nos totais e nos saldos derivados dos postings fica zerado.
      const reversal = await tx.transaction.create({
        data: {
          financialSpaceId: spaceId,
          type: original.type,
          status: 'confirmed',
          description: `Estorno: ${original.description}`,
          notes: body.reason,
          categoryId: original.categoryId,
          currency: original.currency,
          totalAmount: original.totalAmount.negated(),
          effectiveDate,
          reversalOfTransactionId: original.id,
          reversalReason: body.reason,
          postings: {
            create: original.postings.map((p) => ({
              accountId: p.accountId,
              amount: p.amount,
              direction: p.direction === 'debit' ? 'credit' : 'debit',
              effectiveDate,
            })),
          },
        },
        include: {
          postings: true,
          reversalOfTransaction: {
            select: { id: true, description: true, type: true, totalAmount: true, status: true },
          },
        },
      });

      // Marcacao com guarda de concorrencia: so o primeiro estorno "reclama" o
      // original. Um segundo estorno simultaneo nao encontra a linha livre.
      const claimed = await tx.transaction.updateMany({
        where: { id: original.id, financialSpaceId: spaceId, reversedAt: null },
        data: { reversedAt: new Date() },
      });
      if (claimed.count === 0) {
        throw new BadRequestException({
          code: 'ALREADY_REVERSED',
          message: 'Transacao ja foi estornada',
        });
      }

      await tx.auditLog.create({
        data: {
          financialSpaceId: spaceId,
          userId: user.sub,
          operation: 'transaction.reverse',
          entityType: 'Transaction',
          entityId: original.id,
          safeSummary: {
            reversalTransactionId: reversal.id,
            description: original.description,
            totalAmount: original.totalAmount.toString(),
            reason: body.reason ?? null,
          },
        },
      });

      return reversal;
    });
  }

  @Get('/summary/dashboard')
  @Roles(['owner', 'admin', 'contributor', 'viewer'])
  @ApiOperation({ summary: 'Resumo para dashboard do periodo atual' })
  async dashboard(@Param('spaceId') spaceId: string, @Query('month') monthParam?: string) {
    const month = monthParam ?? new Date().toISOString().slice(0, 7);
    const [yearPart, monthPart] = month.split('-').map(Number);
    const startDate = new Date(Date.UTC(yearPart, (monthPart || 1) - 1, 1));
    const endDate = new Date(Date.UTC(yearPart, monthPart || 1, 0));
    const start = startDate.toISOString().slice(0, 10);
    const end = endDate.toISOString().slice(0, 10);

    const where = {
      financialSpaceId: spaceId,
      effectiveDate: { gte: startDate, lte: endDate },
      status: { not: 'canceled' },
    } as const;
    const transactions = await this.prisma.transaction.findMany({ where, include: { postings: true } });

    let totalIncome = '0';
    let totalExpense = '0';
    let realizedBalance = '0';

    for (const t of transactions) {
      const amount = Number(t.totalAmount);
      if (t.status === 'confirmed' && t.type === 'income') totalIncome = (Number(totalIncome) + amount).toFixed(2);
      if (t.status === 'confirmed' && t.type === 'expense') totalExpense = (Number(totalExpense) + amount).toFixed(2);
      if (t.status === 'confirmed') {
        if (t.type === 'income') realizedBalance = (Number(realizedBalance) + amount).toFixed(2);
        if (t.type === 'expense') realizedBalance = (Number(realizedBalance) - amount).toFixed(2);
        if (t.type === 'adjustment') realizedBalance = (Number(realizedBalance) + amount).toFixed(2);
      }
    }

    const upcoming = await this.prisma.transaction.findMany({
      where: {
        financialSpaceId: spaceId,
        status: { in: ['scheduled', 'pending'] },
        dueDate: { gte: startDate, lte: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30) },
      },
      take: 20,
      orderBy: [{ dueDate: 'asc' }],
    });

    return {
      periodStart: start,
      periodEnd: end,
      totalIncome,
      totalExpense,
      netBalance: (Number(totalIncome) - Number(totalExpense)).toFixed(2),
      realizedBalance,
      projectedBalance: (Number(realizedBalance) + upcoming.reduce((acc, t) => acc + (t.type === 'income' ? Number(t.totalAmount) : -Number(t.totalAmount)), 0)).toFixed(2),
      upcomingDueCount: upcoming.length,
      upcomingDueAmount: upcoming.filter((t) => t.type === 'expense').reduce((acc, t) => acc + Number(t.totalAmount), 0).toFixed(2),
    };
  }

  /** Filtro compartilhado entre a listagem paginada e a exportacao em CSV. */
  private buildTransactionFilter(
    spaceId: string,
    f: {
      from?: string;
      to?: string;
      type?: string;
      status?: string;
      accountId?: string;
      categoryId?: string;
      q?: string;
      tag?: string;
    },
  ): Prisma.TransactionWhereInput {
    const where: Prisma.TransactionWhereInput = { financialSpaceId: spaceId };
    if (f.from || f.to) {
      where.effectiveDate = {
        ...(f.from ? { gte: toDate(f.from) } : {}),
        ...(f.to ? { lte: toDate(f.to) } : {}),
      };
    }
    if (f.type) where.type = f.type as TransactionType;
    if (f.status) where.status = f.status as TransactionStatus;
    if (f.accountId) where.postings = { some: { accountId: f.accountId } };
    if (f.categoryId) where.categoryId = f.categoryId;
    // Etiqueta e uma lista livre por transacao; `has` casa quando a etiqueta
    // pesquisada esta presente no array.
    if (f.tag) where.tags = { has: f.tag };
    if (f.q) {
      where.OR = [
        { description: { contains: f.q, mode: 'insensitive' } },
        { notes: { contains: f.q, mode: 'insensitive' } },
      ];
    }
    return where;
  }

  private validatePostings(body: CreateTransactionRequest) {
    const postings = body.postings;
    const sumDebit = postings.filter((p) => p.direction === 'debit').reduce((acc, p) => acc + Number(p.amount), 0);
    const sumCredit = postings.filter((p) => p.direction === 'credit').reduce((acc, p) => acc + Number(p.amount), 0);
    const total = Number(body.totalAmount);

    if (body.type === 'transfer') {
      if (!Number.isFinite(total) || Math.abs(sumDebit - sumCredit) > 0.0001) {
        throw new BadRequestException({
          code: 'INVALID_TRANSFER_POSTINGS',
          message: 'Transferencia deve ter debitos e creditos iguais',
        });
      }
      return;
    }

    const expected = Math.abs(total);
    const diffForType = Math.abs((body.type === 'income' ? sumDebit : sumCredit) - expected);
    if (!Number.isFinite(expected) || diffForType > 0.0001) {
      throw new BadRequestException({
        code: 'INVALID_POSTINGS',
        message: 'Soma dos movimentos nao confere com o total',
      });
    }
  }
}

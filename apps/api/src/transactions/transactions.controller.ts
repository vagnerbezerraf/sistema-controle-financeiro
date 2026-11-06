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
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaClient, Transaction } from '@prisma/client';
import {
  JwtAuthGuard,
  Roles,
  SpaceRoleGuard,
} from '../common/auth/auth.guard';
import { CreateTransactionRequest } from './http/dto';
import { toDate } from '../common/utils/date';

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
  ) {
    const limit = Math.min(Number(limitParam ?? 50), 200);
    const where: any = { financialSpaceId: spaceId };
    if (from || to) where.effectiveDate = {};
    if (from) where.effectiveDate.gte = toDate(from);
    if (to) where.effectiveDate.lte = toDate(to);
    if (type) where.type = type;
    if (status) where.status = status;
    if (accountId) where.postings = { some: { accountId } };
    if (categoryId) where.categoryId = categoryId;
    if (q) where.OR = [{ description: { contains: q, mode: 'insensitive' } }, { notes: { contains: q, mode: 'insensitive' } }];
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

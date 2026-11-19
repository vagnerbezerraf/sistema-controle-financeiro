import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Account, CreditCard, PrismaClient, Transaction } from '@prisma/client';
import {
  CurrentUser,
  JwtAuthGuard,
  Roles,
  SpaceRoleGuard,
  type AuthenticatedUser,
} from '../common/auth/auth.guard';
import { toDate } from '../common/utils/date';
import { updateWithOptimisticLock } from '../common/utils/optimistic-lock';
import { OutboxService } from '../outbox/outbox.service';
import {
  CreateCreditCardRequest,
  PayInvoiceRequest,
  PurchaseInstallmentsRequest,
  UpdateCreditCardRequest,
} from './http/dto';
import { assembleInvoices, type InvoicePosting, type InvoiceView } from './domain/invoice-aggregation';
import { installmentDates, installmentDescription, splitInstallments } from './domain/installments';

type CreditCardWithAccount = CreditCard & { account: Account };

@ApiTags('credit-cards')
@Controller('financial-spaces/:spaceId/credit-cards')
@UseGuards(JwtAuthGuard, SpaceRoleGuard)
@ApiBearerAuth('access-token')
export class CreditCardsController {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly outbox: OutboxService,
  ) {}

  @Get()
  @Roles(['owner', 'admin', 'contributor', 'viewer'])
  @ApiOperation({ summary: 'Listar cartoes de credito do espaco financeiro' })
  async list(@Param('spaceId') spaceId: string) {
    return this.prisma.creditCard.findMany({
      where: { account: { financialSpaceId: spaceId } },
      include: { account: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post()
  @Roles(['owner', 'admin', 'contributor'])
  @ApiOperation({ summary: 'Criar cartao de credito (cria a conta tecnica associada)' })
  async create(
    @Param('spaceId') spaceId: string,
    @Body() body: CreateCreditCardRequest,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.prisma.$transaction(async (tx) => {
      // A conta tecnica (type `credit_card`) e o que permite lancar compras,
      // estornos e pagamentos pelo endpoint de transacoes sem tratamento especial.
      const account = await tx.account.create({
        data: {
          financialSpaceId: spaceId,
          name: body.name,
          type: 'credit_card',
          currency: body.currency ?? 'BRL',
          initialBalance: '0',
          initialBalanceDate: new Date(),
          institution: body.institution,
          color: body.color,
          icon: body.icon,
        },
      });

      const card = await tx.creditCard.create({
        data: {
          accountId: account.id,
          name: body.name,
          limit: body.limit,
          closingDay: body.closingDay,
          dueDay: body.dueDay,
        },
        include: { account: true },
      });

      await tx.auditLog.create({
        data: {
          financialSpaceId: spaceId,
          userId: user.sub,
          operation: 'credit-card.create',
          entityType: 'CreditCard',
          entityId: card.id,
          safeSummary: {
            name: card.name,
            limit: card.limit.toString(),
            closingDay: card.closingDay,
            dueDay: card.dueDay,
          },
        },
      });

      return card;
    });
  }

  @Get(':cardId')
  @Roles(['owner', 'admin', 'contributor', 'viewer'])
  @ApiOperation({ summary: 'Detalhes do cartao de credito' })
  async detail(
    @Param('spaceId') spaceId: string,
    @Param('cardId') cardId: string,
  ): Promise<CreditCardWithAccount> {
    const card = await this.findOne(spaceId, cardId);
    if (!card) throw new NotFoundException('Cartao nao encontrado');
    return card;
  }

  @Patch(':cardId')
  @Roles(['owner', 'admin', 'contributor'])
  @ApiOperation({ summary: 'Atualizar cartao (concorrencia otimista via `version` da conta tecnica)' })
  async update(
    @Param('spaceId') spaceId: string,
    @Param('cardId') cardId: string,
    @Body() body: UpdateCreditCardRequest,
  ) {
    const card = await this.findOne(spaceId, cardId);
    if (!card) throw new NotFoundException('Cartao nao encontrado');

    const { version, ...data } = body;

    return updateWithOptimisticLock<CreditCardWithAccount>({
      applyConditionalUpdate: async () => {
        const res = await this.prisma.account.updateMany({
          where: version === undefined ? { id: card.accountId } : { id: card.accountId, version },
          data: {
            ...(data.name !== undefined ? { name: data.name } : {}),
            version: { increment: 1 },
          },
        });
        if (res.count > 0) {
          await this.prisma.creditCard.update({
            where: { id: cardId },
            data: {
              name: data.name,
              limit: data.limit,
              closingDay: data.closingDay,
              dueDay: data.dueDay,
            },
          });
        }
        return res.count;
      },
      exists: async () => (await this.prisma.account.count({ where: { id: card.accountId } })) > 0,
      reload: () => this.prisma.creditCard.findUniqueOrThrow({ where: { id: cardId }, include: { account: true } }),
      notFoundMessage: 'Cartao nao encontrado',
      staleMessage: 'Cartao foi alterado por outra sessao; recarregue e tente novamente',
    });
  }

  @Get(':cardId/invoices')
  @Roles(['owner', 'admin', 'contributor', 'viewer'])
  @ApiOperation({ summary: 'Listar faturas calculadas do cartao (mais recente primeiro)' })
  async invoices(
    @Param('spaceId') spaceId: string,
    @Param('cardId') cardId: string,
  ): Promise<InvoiceView[]> {
    const card = await this.findOne(spaceId, cardId);
    if (!card) throw new NotFoundException('Cartao nao encontrado');
    return this.buildInvoices(card);
  }

  @Get(':cardId/invoices/:closingDate')
  @Roles(['owner', 'admin', 'contributor', 'viewer'])
  @ApiOperation({ summary: 'Detalhes de uma fatura pelo dia de fechamento (YYYY-MM-DD)' })
  async invoiceDetail(
    @Param('spaceId') spaceId: string,
    @Param('cardId') cardId: string,
    @Param('closingDate') closingDate: string,
  ): Promise<InvoiceView> {
    const card = await this.findOne(spaceId, cardId);
    if (!card) throw new NotFoundException('Cartao nao encontrado');
    const invoice = (await this.buildInvoices(card)).find((i) => i.id === closingDate);
    if (!invoice) throw new NotFoundException('Fatura nao encontrada');
    return invoice;
  }

  @Post(':cardId/invoices/:closingDate/pay')
  @Roles(['owner', 'admin', 'contributor'])
  @ApiOperation({ summary: 'Pagar fatura com transferencia da conta de origem' })
  async pay(
    @Param('spaceId') spaceId: string,
    @Param('cardId') cardId: string,
    @Param('closingDate') closingDate: string,
    @Body() body: PayInvoiceRequest,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const card = await this.findOne(spaceId, cardId);
    if (!card) throw new NotFoundException('Cartao nao encontrado');
    if (body.fromAccountId === card.accountId) {
      throw new BadRequestException({
        code: 'INVALID_SOURCE_ACCOUNT',
        message: 'A conta de origem nao pode ser o proprio cartao',
      });
    }

    const invoice = (await this.buildInvoices(card)).find((i) => i.id === closingDate);
    if (!invoice) throw new NotFoundException('Fatura nao encontrada');

    const outstanding = Number(invoice.outstandingAmount);
    const amount = body.amount === undefined ? outstanding : Number(body.amount);
    if (!(amount > 0)) {
      throw new BadRequestException({
        code: 'NOTHING_TO_PAY',
        message: 'A fatura nao possui saldo devedor a pagar',
      });
    }

    const from = await this.prisma.account.findFirst({
      where: { id: body.fromAccountId, financialSpaceId: spaceId },
    });
    if (!from) throw new NotFoundException('Conta de origem nao encontrada');

    if (idempotencyKey) {
      const existing = await this.prisma.idempotencyRecord.findUnique({
        where: { financialSpaceId_idempotencyKey: { financialSpaceId: spaceId, idempotencyKey } },
      });
      if (existing) return existing.responsePayload;
    }

    // Pagamento e uma transferencia: debita a conta do cartao (reduz a divida)
    // e credita a conta de origem (sai o dinheiro). Nao cria despesa nova, para
    // nao contabilizar o mesmo gasto duas vezes.
    const value = amount.toFixed(2);
    const effectiveDate = toDate(body.effectiveDate ?? new Date().toISOString().slice(0, 10));

    return this.prisma.$transaction(async (tx) => {
      const trx = await tx.transaction.create({
        data: {
          financialSpaceId: spaceId,
          type: 'transfer',
          status: 'confirmed',
          description: `Pagamento fatura ${card.name} - ${closingDate}`,
          currency: card.account.currency,
          totalAmount: value,
          effectiveDate,
          idempotencyKey,
          postings: {
            create: [
              { accountId: card.accountId, amount: value, direction: 'debit', effectiveDate },
              { accountId: from.id, amount: value, direction: 'credit', effectiveDate },
            ],
          },
        },
        include: { postings: true },
      });

      if (idempotencyKey) {
        await tx.idempotencyRecord.create({
          data: {
            financialSpaceId: spaceId,
            idempotencyKey,
            requestFingerprint: JSON.stringify({ ...body, closingDate }).slice(0, 512),
            responsePayload: trx as any,
            expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
          },
        });
      }

      await tx.auditLog.create({
        data: {
          financialSpaceId: spaceId,
          userId: user.sub,
          operation: 'invoice.pay',
          entityType: 'CreditCard',
          entityId: card.id,
          safeSummary: {
            closingDate,
            amount: value,
            fromAccountId: from.id,
            transactionId: trx.id,
          },
        },
      });

      await this.outbox.record(tx, {
        financialSpaceId: spaceId,
        eventType: 'invoice.paid',
        payload: {
          cardId: card.id,
          closingDate,
          amount: value,
          transactionId: trx.id,
        },
      });

      return trx;
    });
  }

  @Post(':cardId/purchases')
  @Roles(['owner', 'admin', 'contributor'])
  @ApiOperation({ summary: 'Lancar compra no cartao, opcionalmente parcelada (N parcelas mensais)' })
  async purchase(
    @Param('spaceId') spaceId: string,
    @Param('cardId') cardId: string,
    @Body() body: PurchaseInstallmentsRequest,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const card = await this.findOne(spaceId, cardId);
    if (!card) throw new NotFoundException('Cartao nao encontrado');

    const totalCents = Math.round(Number(body.totalAmount) * 100);
    if (!Number.isFinite(totalCents) || totalCents <= 0) {
      throw new BadRequestException({
        code: 'INVALID_AMOUNT',
        message: 'O valor da compra deve ser positivo',
      });
    }

    if (idempotencyKey) {
      const existing = await this.prisma.idempotencyRecord.findUnique({
        where: { financialSpaceId_idempotencyKey: { financialSpaceId: spaceId, idempotencyKey } },
      });
      if (existing) return existing.responsePayload;
    }

    // A compra vira N transacoes (uma por parcela), cada uma caindo no ciclo da
    // sua competencia. A soma das parcelas e exatamente o total da compra
    // (divisao em centavos) e a ultima parcela nunca "escorrega" de mes.
    const purchaseDate = toDate(body.purchaseDate ?? new Date().toISOString().slice(0, 10));
    const amounts = splitInstallments(totalCents, body.installments);
    const dates = installmentDates(purchaseDate, body.installments);
    const groupId = randomUUID();
    const isInstallment = body.installments > 1;

    return this.prisma.$transaction(async (tx) => {
      const created: Transaction[] = [];
      for (let index = 0; index < amounts.length; index += 1) {
        const amount = (amounts[index] / 100).toFixed(2);
        const trx = await tx.transaction.create({
          data: {
            financialSpaceId: spaceId,
            type: 'expense',
            status: 'confirmed',
            description: installmentDescription(body.description, index + 1, body.installments),
            categoryId: body.categoryId,
            currency: card.account.currency,
            totalAmount: amount,
            effectiveDate: dates[index],
            tags: body.tags ?? [],
            installmentGroupId: isInstallment ? groupId : null,
            installmentNumber: isInstallment ? index + 1 : null,
            installmentCount: isInstallment ? body.installments : null,
            postings: {
              create: [
                { accountId: card.accountId, amount, direction: 'credit', effectiveDate: dates[index] },
              ],
            },
          },
        });
        created.push(trx);
      }

      const payload = {
        installmentGroupId: isInstallment ? groupId : null,
        installments: body.installments,
        totalAmount: (totalCents / 100).toFixed(2),
        purchaseDate: dates[0].toISOString().slice(0, 10),
        transactions: created,
      };

      if (idempotencyKey) {
        await tx.idempotencyRecord.create({
          data: {
            financialSpaceId: spaceId,
            idempotencyKey,
            requestFingerprint: JSON.stringify({ cardId, ...body }).slice(0, 512),
            responsePayload: payload as any,
            expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
          },
        });
      }

      await tx.auditLog.create({
        data: {
          financialSpaceId: spaceId,
          userId: user.sub,
          operation: 'installment.purchase',
          entityType: 'CreditCard',
          entityId: card.id,
          safeSummary: {
            description: body.description,
            totalAmount: payload.totalAmount,
            installments: body.installments,
            installmentGroupId: payload.installmentGroupId,
            transactionIds: created.map((t) => t.id),
          },
        },
      });

      return payload;
    });
  }

  /** Carrega o cartao garantindo que ele pertence ao espaco financeiro da rota. */
  private findOne(spaceId: string, cardId: string): Promise<CreditCardWithAccount | null> {
    return this.prisma.creditCard.findFirst({
      where: { id: cardId, account: { financialSpaceId: spaceId } },
      include: { account: true },
    });
  }

  /** Le os movimentos da conta tecnica e delega a montagem das faturas ao dominio. */
  private async buildInvoices(card: CreditCardWithAccount): Promise<InvoiceView[]> {
    const postings = await this.prisma.posting.findMany({
      where: { accountId: card.accountId },
      select: { amount: true, direction: true, effectiveDate: true },
    });
    const normalized: InvoicePosting[] = postings.map((p) => ({
      amount: Number(p.amount),
      direction: p.direction,
      effectiveDate: p.effectiveDate,
    }));
    return assembleInvoices({
      postings: normalized,
      closingDay: card.closingDay,
      dueDay: card.dueDay,
      now: new Date(),
    });
  }
}

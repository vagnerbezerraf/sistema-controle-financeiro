import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Obligation, ObligationStatus, Prisma, PrismaClient } from '@prisma/client';
import {
  CurrentUser,
  JwtAuthGuard,
  Roles,
  SpaceRoleGuard,
  type AuthenticatedUser,
} from '../common/auth/auth.guard';
import { startOfUtcDay, toDate } from '../common/utils/date';
import { updateWithOptimisticLock } from '../common/utils/optimistic-lock';
import { OutboxService } from '../outbox/outbox.service';
import {
  canTransitionObligation,
  isObligationOverdue,
  reconcileStatusFor,
} from './domain/obligation-status';
import {
  CreateObligationRequest,
  ListObligationsQuery,
  ReconcileObligationRequest,
  UpdateObligationRequest,
} from './http/dto';

/** Status persistidos que continuam "em aberto" (sujeitos a ficarem vencidos). */
const OPEN_STATUSES: ObligationStatus[] = ['forecast', 'pending'];

interface ObligationView {
  id: string;
  financialSpaceId: string;
  recurrenceRuleId: string | null;
  type: string;
  description: string;
  currency: string;
  amount: string;
  dueDate: string;
  status: string;
  /** Derivado: vencimento passado e obrigacao ainda em aberto. Nunca gravado. */
  overdue: boolean;
  transactionId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

const iso = (date: Date) => date.toISOString().slice(0, 10);

@ApiTags('obligations')
@Controller('financial-spaces/:spaceId/obligations')
@UseGuards(JwtAuthGuard, SpaceRoleGuard)
@ApiBearerAuth('access-token')
export class ObligationsController {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly outbox: OutboxService,
  ) {}

  @Get()
  @Roles(['owner', 'admin', 'contributor', 'viewer'])
  @ApiOperation({ summary: 'Listar contas a pagar/receber e previsoes' })
  async list(@Param('spaceId') spaceId: string, @Query() query: ListObligationsQuery) {
    const where: Prisma.ObligationWhereInput = { financialSpaceId: spaceId };

    const dueDate: Prisma.DateTimeFilter = {};
    if (query.from) dueDate.gte = startOfUtcDay(query.from);
    if (query.to) dueDate.lte = startOfUtcDay(query.to);
    if (Object.keys(dueDate).length > 0) where.dueDate = dueDate;

    if (query.status) where.status = query.status as ObligationStatus;
    if (query.type) where.type = query.type;
    if (query.recurrenceRuleId) where.recurrenceRuleId = query.recurrenceRuleId;

    // `overdue` e derivado (nao ha coluna). Como a leitura depende do "hoje",
    // o filtro vira uma combinacao de status em aberto com vencimento passado.
    if (query.overdue === 'true') {
      where.status = { in: OPEN_STATUSES };
      where.dueDate = { ...(where.dueDate as Prisma.DateTimeFilter), lt: startOfUtcDay() };
    } else if (query.overdue === 'false') {
      where.NOT = { status: { in: OPEN_STATUSES }, dueDate: { lt: startOfUtcDay() } };
    }

    const obligations = await this.prisma.obligation.findMany({
      where,
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
    });
    return obligations.map((obligation) => this.toView(obligation));
  }

  @Post()
  @Roles(['owner', 'admin', 'contributor'])
  @ApiOperation({ summary: 'Criar uma conta a pagar/receber avulsa' })
  async create(
    @Param('spaceId') spaceId: string,
    @Body() body: CreateObligationRequest,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ObligationView> {
    return this.prisma.$transaction(async (tx) => {
      const obligation = await tx.obligation.create({
        data: {
          financialSpaceId: spaceId,
          type: body.type,
          description: body.description,
          currency: body.currency ?? 'BRL',
          amount: body.amount,
          dueDate: toDate(body.dueDate),
          // Avulsa comeca como previsao ou ja a pagar; nunca conciliada.
          status: body.status ?? 'pending',
        },
      });

      await tx.auditLog.create({
        data: {
          financialSpaceId: spaceId,
          userId: user.sub,
          operation: 'obligation.create',
          entityType: 'Obligation',
          entityId: obligation.id,
          safeSummary: {
            type: obligation.type,
            amount: obligation.amount.toString(),
            dueDate: iso(obligation.dueDate),
            status: obligation.status,
          },
        },
      });

      return this.toView(obligation);
    });
  }

  @Get(':obligationId')
  @Roles(['owner', 'admin', 'contributor', 'viewer'])
  @ApiOperation({ summary: 'Detalhes da obrigacao' })
  async detail(
    @Param('spaceId') spaceId: string,
    @Param('obligationId') obligationId: string,
  ): Promise<ObligationView> {
    const obligation = await this.findOne(spaceId, obligationId);
    if (!obligation) throw new NotFoundException('Obrigacao nao encontrada');
    return this.toView(obligation);
  }

  @Patch(':obligationId')
  @Roles(['owner', 'admin', 'contributor'])
  @ApiOperation({ summary: 'Atualizar obrigacao (concorrencia otimista via `version`)' })
  async update(
    @Param('spaceId') spaceId: string,
    @Param('obligationId') obligationId: string,
    @Body() body: UpdateObligationRequest,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ObligationView> {
    const current = await this.findOne(spaceId, obligationId);
    if (!current) throw new NotFoundException('Obrigacao nao encontrada');

    // As situacoes vindas da conciliacao nao sao atribuiveis manualmente e so
    // mudam pelo endpoint de conciliacao.
    if (current.status === 'reconciled' || current.status === 'partially_reconciled') {
      throw new BadRequestException({
        code: 'OBLIGATION_RECONCILED',
        message: 'Obrigacao conciliada nao pode ser editada manualmente',
      });
    }
    if (body.status !== undefined && body.status !== current.status) {
      if (!canTransitionObligation(current.status, body.status)) {
        throw new BadRequestException({
          code: 'INVALID_STATUS_TRANSITION',
          message: `Nao e possivel mudar de "${current.status}" para "${body.status}"`,
        });
      }
    }

    const { version } = body;

    return this.prisma.$transaction(async (tx) => {
      const updated = await updateWithOptimisticLock<Obligation>({
        applyConditionalUpdate: async () => {
          const res = await tx.obligation.updateMany({
            where: version === undefined ? { id: obligationId } : { id: obligationId, version },
            data: {
              description: body.description,
              amount: body.amount,
              dueDate: body.dueDate ? toDate(body.dueDate) : undefined,
              status: body.status,
              version: { increment: 1 },
            },
          });
          return res.count;
        },
        exists: async () => (await tx.obligation.count({ where: { id: obligationId } })) > 0,
        reload: () => tx.obligation.findUniqueOrThrow({ where: { id: obligationId } }),
        notFoundMessage: 'Obrigacao nao encontrada',
        staleMessage: 'Obrigacao foi alterada por outra sessao; recarregue e tente novamente',
      });

      await tx.auditLog.create({
        data: {
          financialSpaceId: spaceId,
          userId: user.sub,
          operation: 'obligation.update',
          entityType: 'Obligation',
          entityId: updated.id,
          safeSummary: {
            status: updated.status,
            amount: updated.amount.toString(),
            dueDate: iso(updated.dueDate),
          },
        },
      });

      return this.toView(updated);
    });
  }

  @Post(':obligationId/reconcile')
  @Roles(['owner', 'admin', 'contributor'])
  @ApiOperation({ summary: 'Conciliar a obrigacao com uma transacao confirmada' })
  async reconcile(
    @Param('spaceId') spaceId: string,
    @Param('obligationId') obligationId: string,
    @Body() body: ReconcileObligationRequest,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ObligationView> {
    const obligation = await this.findOne(spaceId, obligationId);
    if (!obligation) throw new NotFoundException('Obrigacao nao encontrada');
    if (obligation.status === 'reconciled' || obligation.status === 'partially_reconciled') {
      throw new BadRequestException({
        code: 'ALREADY_RECONCILED',
        message: 'A obrigacao ja foi conciliada',
      });
    }

    const transaction = await this.prisma.transaction.findFirst({
      where: { id: body.transactionId, financialSpaceId: spaceId },
    });
    if (!transaction) throw new NotFoundException('Transacao nao encontrada');
    if (transaction.status !== 'confirmed') {
      throw new BadRequestException({
        code: 'TRANSACTION_NOT_CONFIRMED',
        message: 'Apenas transacoes confirmadas podem conciliar uma obrigacao',
      });
    }

    const takenBy = await this.prisma.obligation.findFirst({
      where: { transactionId: body.transactionId },
    });
    if (takenBy && takenBy.id !== obligationId) {
      throw new BadRequestException({
        code: 'TRANSACTION_ALREADY_RECONCILED',
        message: 'A transacao ja esta vinculada a outra obrigacao',
      });
    }

    // Cobre o valor -> `reconciled`; abate apenas parte -> `partially_reconciled`.
    const status = reconcileStatusFor(obligation.amount.toString(), transaction.totalAmount.toString());

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.obligation.update({
        where: { id: obligationId },
        data: { transactionId: transaction.id, status, version: { increment: 1 } },
      });

      await tx.auditLog.create({
        data: {
          financialSpaceId: spaceId,
          userId: user.sub,
          operation: 'obligation.reconcile',
          entityType: 'Obligation',
          entityId: updated.id,
          safeSummary: {
            transactionId: transaction.id,
            status: updated.status,
            amount: updated.amount.toString(),
          },
        },
      });

      await this.outbox.record(tx, {
        financialSpaceId: spaceId,
        eventType: 'obligation.reconciled',
        payload: {
          obligationId: updated.id,
          transactionId: transaction.id,
          status: updated.status,
        },
      });

      return this.toView(updated);
    });
  }

  private toView(obligation: Obligation): ObligationView {
    return {
      id: obligation.id,
      financialSpaceId: obligation.financialSpaceId,
      recurrenceRuleId: obligation.recurrenceRuleId,
      type: obligation.type,
      description: obligation.description,
      currency: obligation.currency,
      amount: obligation.amount.toString(),
      dueDate: iso(obligation.dueDate),
      status: obligation.status,
      overdue: isObligationOverdue(obligation),
      transactionId: obligation.transactionId,
      version: obligation.version,
      createdAt: obligation.createdAt.toISOString(),
      updatedAt: obligation.updatedAt.toISOString(),
    };
  }

  private findOne(spaceId: string, obligationId: string): Promise<Obligation | null> {
    return this.prisma.obligation.findFirst({ where: { id: obligationId, financialSpaceId: spaceId } });
  }
}

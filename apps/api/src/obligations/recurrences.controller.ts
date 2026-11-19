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
import { CurrencyCode, Prisma, PrismaClient, RecurrenceRule } from '@prisma/client';
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
import { defaultHorizon, occurrenceDates } from './domain/recurrence';
import {
  CreateRecurrenceRequest,
  GenerateOccurrencesRequest,
  ListRecurrencesQuery,
  RecurrenceTemplateInput,
  UpdateRecurrenceRequest,
} from './http/dto';

/** Dados replicados na obrigacao a cada ocorrencia materializada. */
interface RecurrenceTemplateSnapshot {
  type: 'income' | 'expense';
  description: string;
  amount: string;
  currency?: CurrencyCode;
  categoryId?: string | null;
  accountId?: string | null;
}

interface RecurrenceRuleView {
  id: string;
  financialSpaceId: string;
  frequency: string;
  interval: number;
  startDate: string;
  endDate: string | null;
  occurrencesLimit: number | null;
  template: RecurrenceTemplateSnapshot;
  timezone: string;
  state: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  /** Ocorrencias previstas criadas nesta operacao (0 quando nada era novo). */
  generatedCount: number;
}

const iso = (date: Date) => date.toISOString().slice(0, 10);

@ApiTags('recurrences')
@Controller('financial-spaces/:spaceId/recurrences')
@UseGuards(JwtAuthGuard, SpaceRoleGuard)
@ApiBearerAuth('access-token')
export class RecurrencesController {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly outbox: OutboxService,
  ) {}

  @Get()
  @Roles(['owner', 'admin', 'contributor', 'viewer'])
  @ApiOperation({ summary: 'Listar regras de recorrencia do espaco financeiro' })
  async list(@Param('spaceId') spaceId: string, @Query() query: ListRecurrencesQuery) {
    const rules = await this.prisma.recurrenceRule.findMany({
      where: { financialSpaceId: spaceId, ...(query.state ? { state: query.state } : {}) },
      orderBy: { createdAt: 'desc' },
    });
    return rules.map((rule) => this.toView(rule, 0));
  }

  @Post()
  @Roles(['owner', 'admin', 'contributor'])
  @ApiOperation({ summary: 'Criar regra de recorrencia e materializar as previsoes ate o horizonte' })
  async create(
    @Param('spaceId') spaceId: string,
    @Body() body: CreateRecurrenceRequest,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RecurrenceRuleView> {
    const horizon = body.generateUpTo ? toDate(body.generateUpTo) : defaultHorizon(new Date());

    return this.prisma.$transaction(async (tx) => {
      const rule = await tx.recurrenceRule.create({
        data: {
          financialSpaceId: spaceId,
          frequency: body.frequency,
          interval: body.interval ?? 1,
          startDate: toDate(body.startDate),
          endDate: body.endDate ? toDate(body.endDate) : null,
          occurrencesLimit: body.occurrencesLimit ?? null,
          template: this.toTemplateJson(body.template),
        },
      });

      const { generatedCount } = await this.materialize(tx, rule, horizon);

      await tx.auditLog.create({
        data: {
          financialSpaceId: spaceId,
          userId: user.sub,
          operation: 'recurrence.create',
          entityType: 'RecurrenceRule',
          entityId: rule.id,
          safeSummary: {
            frequency: rule.frequency,
            interval: rule.interval,
            startDate: iso(rule.startDate),
            generatedCount,
          },
        },
      });

      return this.toView(rule, generatedCount);
    });
  }

  @Get(':ruleId')
  @Roles(['owner', 'admin', 'contributor', 'viewer'])
  @ApiOperation({ summary: 'Detalhes da regra de recorrencia' })
  async detail(
    @Param('spaceId') spaceId: string,
    @Param('ruleId') ruleId: string,
  ): Promise<RecurrenceRuleView> {
    const rule = await this.findOne(spaceId, ruleId);
    if (!rule) throw new NotFoundException('Regra de recorrencia nao encontrada');
    return this.toView(rule, 0);
  }

  @Patch(':ruleId')
  @Roles(['owner', 'admin', 'contributor'])
  @ApiOperation({ summary: 'Atualizar regra (concorrencia otimista via `version`)' })
  async update(
    @Param('spaceId') spaceId: string,
    @Param('ruleId') ruleId: string,
    @Body() body: UpdateRecurrenceRequest,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RecurrenceRuleView> {
    const rule = await this.findOne(spaceId, ruleId);
    if (!rule) throw new NotFoundException('Regra de recorrencia nao encontrada');

    const horizon = body.generateUpTo ? toDate(body.generateUpTo) : null;
    const { version } = body;

    return this.prisma.$transaction(async (tx) => {
      const updated = await updateWithOptimisticLock<RecurrenceRule>({
        applyConditionalUpdate: async () => {
          const res = await tx.recurrenceRule.updateMany({
            where: version === undefined ? { id: ruleId } : { id: ruleId, version },
            data: {
              frequency: body.frequency,
              interval: body.interval,
              // `null` remove o limite; `undefined` (ausente) preserva o atual.
              endDate:
                body.endDate === undefined ? undefined : body.endDate === null ? null : toDate(body.endDate),
              occurrencesLimit: body.occurrencesLimit,
              template: body.template ? this.toTemplateJson(body.template) : undefined,
              state: body.state,
              version: { increment: 1 },
            },
          });
          return res.count;
        },
        exists: async () => (await tx.recurrenceRule.count({ where: { id: ruleId } })) > 0,
        reload: () => tx.recurrenceRule.findUniqueOrThrow({ where: { id: ruleId } }),
        notFoundMessage: 'Regra de recorrencia nao encontrada',
        staleMessage: 'Regra foi alterada por outra sessao; recarregue e tente novamente',
      });

      // Regenera apenas quando o cliente pede um horizonte explicito.
      const generatedCount = horizon ? (await this.materialize(tx, updated, horizon)).generatedCount : 0;

      await tx.auditLog.create({
        data: {
          financialSpaceId: spaceId,
          userId: user.sub,
          operation: 'recurrence.update',
          entityType: 'RecurrenceRule',
          entityId: updated.id,
          safeSummary: {
            frequency: updated.frequency,
            interval: updated.interval,
            state: updated.state,
            generatedCount,
          },
        },
      });

      return this.toView(updated, generatedCount);
    });
  }

  @Post(':ruleId/generate')
  @Roles(['owner', 'admin', 'contributor'])
  @ApiOperation({ summary: 'Materializar as proximas ocorrencias previstas (idempotente)' })
  async generate(
    @Param('spaceId') spaceId: string,
    @Param('ruleId') ruleId: string,
    @Body() body: GenerateOccurrencesRequest,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const rule = await this.findOne(spaceId, ruleId);
    if (!rule) throw new NotFoundException('Regra de recorrencia nao encontrada');
    if (rule.state !== 'active') {
      throw new BadRequestException({
        code: 'RECURRENCE_ARCHIVED',
        message: 'Nao e possivel gerar ocorrencias de uma regra arquivada',
      });
    }

    const horizon = body.upTo ? toDate(body.upTo) : defaultHorizon(new Date());

    return this.prisma.$transaction(async (tx) => {
      const { generatedCount, plannedCount } = await this.materialize(tx, rule, horizon);

      await tx.auditLog.create({
        data: {
          financialSpaceId: spaceId,
          userId: user.sub,
          operation: 'recurrence.generate',
          entityType: 'RecurrenceRule',
          entityId: rule.id,
          safeSummary: { horizon: iso(horizon), generatedCount, plannedCount },
        },
      });

      // So registra evento quando algo novo foi materializado: assim o outbox
      // nao acumula publicacoes vazias em reexecucoes idempotentes.
      if (generatedCount > 0) {
        await this.outbox.record(tx, {
          financialSpaceId: spaceId,
          eventType: 'recurrence.generated',
          payload: { ruleId: rule.id, generatedCount, plannedCount, horizon: iso(horizon) },
        });
      }

      return { generatedCount, plannedCount, horizon: iso(horizon) };
    });
  }

  /**
   * Grava as obrigacoes previstas da agenda dentro do horizonte.
   *
   * A insercao usa `skipDuplicates` sobre o indice unico `(regra, vencimento)`,
   * o que torna a reexecucao inofensiva: uma ocorrencia ja materializada nao e
   * recriada (nem sobrescrita). O retorno separa o que foi criado agora
   * (`generatedCount`) do total previsto pela agenda (`plannedCount`).
   */
  private async materialize(
    tx: Prisma.TransactionClient,
    rule: RecurrenceRule,
    horizon: Date,
  ): Promise<{ generatedCount: number; plannedCount: number }> {
    const template = rule.template as unknown as RecurrenceTemplateSnapshot;
    const dates = occurrenceDates(
      {
        frequency: rule.frequency,
        interval: rule.interval,
        startDate: rule.startDate,
        endDate: rule.endDate,
        occurrencesLimit: rule.occurrencesLimit,
      },
      horizon,
    );
    if (dates.length === 0) return { generatedCount: 0, plannedCount: 0 };

    const res = await tx.obligation.createMany({
      data: dates.map((dueDate) => ({
        financialSpaceId: rule.financialSpaceId,
        recurrenceRuleId: rule.id,
        status: 'forecast' as const,
        type: template.type,
        description: template.description,
        currency: template.currency ?? 'BRL',
        amount: template.amount,
        dueDate,
      })),
      skipDuplicates: true,
    });

    return { generatedCount: res.count, plannedCount: dates.length };
  }

  private toTemplateJson(template: RecurrenceTemplateInput): Prisma.InputJsonValue {
    return {
      type: template.type,
      description: template.description,
      amount: template.amount,
      currency: template.currency ?? 'BRL',
      categoryId: template.categoryId ?? null,
      accountId: template.accountId ?? null,
    };
  }

  private toView(rule: RecurrenceRule, generatedCount: number): RecurrenceRuleView {
    return {
      id: rule.id,
      financialSpaceId: rule.financialSpaceId,
      frequency: rule.frequency,
      interval: rule.interval,
      startDate: iso(rule.startDate),
      endDate: rule.endDate ? iso(rule.endDate) : null,
      occurrencesLimit: rule.occurrencesLimit,
      template: rule.template as unknown as RecurrenceTemplateSnapshot,
      timezone: rule.timezone,
      state: rule.state,
      version: rule.version,
      createdAt: rule.createdAt.toISOString(),
      updatedAt: rule.updatedAt.toISOString(),
      generatedCount,
    };
  }

  private findOne(spaceId: string, ruleId: string): Promise<RecurrenceRule | null> {
    return this.prisma.recurrenceRule.findFirst({ where: { id: ruleId, financialSpaceId: spaceId } });
  }
}

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaClient, type CategorizationRule as CategorizationRuleRow } from '@prisma/client';
import type { ApplyCategorizationResult, CategorizationRule } from '@scf/api-contracts';
import { startOfUtcDay } from '../common/utils/date';
import { updateWithOptimisticLock } from '../common/utils/optimistic-lock';
import {
  DEFAULT_RULE_PRIORITY,
  resolveCategoryId,
  type CategorizationRuleInput,
  type CategorizationTargetType,
} from './domain/categorization-rule';
import type {
  CreateCategorizationRuleRequest,
  UpdateCategorizationRuleRequest,
} from './http/dto';

type RuleWithCategory = CategorizationRuleRow & { category: { name: string } };

/** Converte a linha do banco para a visao publica da API. */
function toView(row: RuleWithCategory): CategorizationRule {
  return {
    id: row.id,
    financialSpaceId: row.financialSpaceId,
    name: row.name,
    matchType: row.matchType,
    pattern: row.pattern,
    categoryId: row.categoryId,
    categoryName: row.category?.name ?? null,
    type: row.type,
    priority: row.priority,
    state: row.state,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    version: row.version,
  };
}

/**
 * Regras de categorizacao automatica: CRUD com concorrencia otimista e a
 * aplicacao retroativa aos lancamentos ainda sem categoria. O casamento em si
 * vive no dominio puro (`domain/categorization-rule`); aqui so ha persistencia,
 * validacao de escopo e auditoria.
 */
@Injectable()
export class CategorizationService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(spaceId: string, state?: 'active' | 'archived'): Promise<CategorizationRule[]> {
    const rows = await this.prisma.categorizationRule.findMany({
      where: { financialSpaceId: spaceId, ...(state ? { state } : {}) },
      include: { category: { select: { name: true } } },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(toView);
  }

  async create(
    spaceId: string,
    body: CreateCategorizationRuleRequest,
    userId: string,
  ): Promise<CategorizationRule> {
    this.assertPattern(body.pattern);
    await this.assertCategory(spaceId, body.categoryId);

    const row = await this.prisma.categorizationRule.create({
      data: {
        financialSpaceId: spaceId,
        name: body.name,
        matchType: body.matchType,
        pattern: body.pattern,
        categoryId: body.categoryId,
        type: body.type ?? null,
        priority: body.priority ?? DEFAULT_RULE_PRIORITY,
      },
      include: { category: { select: { name: true } } },
    });

    await this.audit(spaceId, userId, 'categorizationRule.create', row.id, {
      name: row.name,
      matchType: row.matchType,
      pattern: row.pattern,
      type: row.type,
      priority: row.priority,
    });
    return toView(row);
  }

  async update(
    spaceId: string,
    ruleId: string,
    body: UpdateCategorizationRuleRequest,
    userId: string,
  ): Promise<CategorizationRule> {
    const existing = await this.prisma.categorizationRule.findFirst({
      where: { id: ruleId, financialSpaceId: spaceId },
    });
    if (!existing) throw new NotFoundException('Regra de categorizacao nao encontrada');
    if (body.pattern !== undefined) this.assertPattern(body.pattern);
    if (body.categoryId !== undefined) await this.assertCategory(spaceId, body.categoryId);

    const { version, ...rest } = body;
    const data: Prisma.CategorizationRuleUpdateInput = {};
    if (rest.name !== undefined) data.name = rest.name;
    if (rest.matchType !== undefined) data.matchType = rest.matchType;
    if (rest.pattern !== undefined) data.pattern = rest.pattern;
    if (rest.categoryId !== undefined) data.category = { connect: { id: rest.categoryId } };
    // `type: null` limpa o filtro (regra passa a valer para receita e despesa).
    if (rest.type !== undefined) data.type = rest.type;
    if (rest.priority !== undefined) data.priority = rest.priority;
    if (rest.state !== undefined) data.state = rest.state;

    const scope = { id: ruleId, financialSpaceId: spaceId };
    const updated = await updateWithOptimisticLock<RuleWithCategory>({
      applyConditionalUpdate: async () => {
        const res = await this.prisma.categorizationRule.updateMany({
          where: version === undefined ? scope : { ...scope, version },
          data: { ...data, version: { increment: 1 } },
        });
        return res.count;
      },
      exists: async () => (await this.prisma.categorizationRule.count({ where: scope })) > 0,
      reload: () =>
        this.prisma.categorizationRule.findUniqueOrThrow({
          where: { id: ruleId },
          include: { category: { select: { name: true } } },
        }),
      notFoundMessage: 'Regra de categorizacao nao encontrada',
      staleMessage: 'Regra foi alterada por outra sessao; recarregue e tente novamente',
    });

    await this.audit(spaceId, userId, 'categorizationRule.update', ruleId, {
      name: updated.name,
      state: updated.state,
    });
    return toView(updated);
  }

  async remove(spaceId: string, ruleId: string, userId: string): Promise<{ deleted: true }> {
    const existing = await this.prisma.categorizationRule.findFirst({
      where: { id: ruleId, financialSpaceId: spaceId },
    });
    if (!existing) throw new NotFoundException('Regra de categorizacao nao encontrada');

    await this.prisma.categorizationRule.delete({ where: { id: ruleId } });
    await this.audit(spaceId, userId, 'categorizationRule.remove', ruleId, { name: existing.name });
    return { deleted: true };
  }

  /**
   * Aplica as regras ativas de forma retroativa aos lancamentos sem categoria
   * (opcionalmente restrito a uma janela de datas). Cada lancamento recebe a
   * categoria da primeira regra que casar; lancamentos ja categorizados ficam
   * intactos.
   */
  async apply(
    spaceId: string,
    window: { from?: string; to?: string },
    userId: string,
  ): Promise<ApplyCategorizationResult> {
    const rules = await this.loadRuleInputs(spaceId);

    const hasWindow = window.from !== undefined || window.to !== undefined;
    const transactions = await this.prisma.transaction.findMany({
      where: {
        financialSpaceId: spaceId,
        categoryId: null,
        status: { not: 'canceled' },
        type: { in: ['income', 'expense'] },
        ...(hasWindow
          ? {
              effectiveDate: {
                ...(window.from ? { gte: startOfUtcDay(window.from) } : {}),
                ...(window.to ? { lte: startOfUtcDay(window.to) } : {}),
              },
            }
          : {}),
      },
      select: { id: true, description: true, type: true },
    });

    let applied = 0;
    for (const transaction of transactions) {
      const categoryId = resolveCategoryId(rules, {
        description: transaction.description,
        type: transaction.type as CategorizationTargetType,
      });
      if (!categoryId) continue;
      await this.prisma.transaction.update({ where: { id: transaction.id }, data: { categoryId } });
      applied += 1;
    }

    const result: ApplyCategorizationResult = { scanned: transactions.length, applied };
    if (applied > 0) {
      await this.audit(spaceId, userId, 'categorization.apply', spaceId, {
        scanned: result.scanned,
        applied: result.applied,
        from: window.from ?? null,
        to: window.to ?? null,
      });
    }
    return result;
  }

  /**
   * Carrega as regras ativas no formato do dominio puro, para casamento em
   * lote (usado no commit de importacao). Uma unica leitura serve N lancamentos.
   */
  async loadRuleInputs(spaceId: string): Promise<CategorizationRuleInput[]> {
    const rows = await this.prisma.categorizationRule.findMany({
      where: { financialSpaceId: spaceId, state: 'active' },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, priority: true, matchType: true, pattern: true, categoryId: true, type: true },
    });
    return rows.map((row) => ({
      id: row.id,
      priority: row.priority,
      matchType: row.matchType,
      pattern: row.pattern,
      categoryId: row.categoryId,
      // Regras so guardam receita/despesa; qualquer outro valor equivale a "ambos".
      type: row.type === 'income' || row.type === 'expense' ? row.type : null,
    }));
  }

  private assertPattern(pattern: string): void {
    if (!pattern.trim()) {
      throw new BadRequestException({
        code: 'INVALID_RULE_PATTERN',
        message: 'O padrao da regra nao pode ser vazio',
      });
    }
  }

  /** Garante que a categoria alvo pertence ao espaco (evita referencia cruzada). */
  private async assertCategory(spaceId: string, categoryId: string): Promise<void> {
    const count = await this.prisma.category.count({
      where: { id: categoryId, financialSpaceId: spaceId },
    });
    if (count === 0) {
      throw new BadRequestException({
        code: 'INVALID_CATEGORY',
        message: 'Categoria nao pertence a este espaco financeiro',
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
        entityType: 'CategorizationRule',
        entityId,
        safeSummary,
      },
    });
  }
}

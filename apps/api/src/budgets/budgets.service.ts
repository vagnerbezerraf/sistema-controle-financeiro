import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { startOfUtcDay } from '../common/utils/date';
import { buildBudgetsView, type BudgetInput } from './domain/budget';

const iso = (date: Date): string => date.toISOString().slice(0, 10);
const cents = (amount: Prisma.Decimal | string | number): number => Math.round(Number(amount) * 100);

/**
 * Leitura derivada dos orcamentos de um periodo: le os limites persistidos e
 * soma o consumo das despesas confirmadas. Fica em um servico proprio para ser
 * reaproveitado pelos alertas de planejamento sem duplicar a leitura.
 */
@Injectable()
export class BudgetsService {
  constructor(private readonly prisma: PrismaClient) {}

  async read(spaceId: string, window: { from: string; to: string }) {
    const budgets = await this.prisma.budget.findMany({
      where: {
        financialSpaceId: spaceId,
        periodStart: { gte: startOfUtcDay(window.from) },
        periodEnd: { lte: startOfUtcDay(window.to) },
      },
      include: { category: { select: { name: true } } },
      orderBy: [{ categoryId: 'asc' }, { createdAt: 'asc' }],
    });

    if (budgets.length === 0) return buildBudgetsView(window, []);

    // Uma unica leitura de despesas cobre todos os periodos; o recorte por
    // orcamento (periodo + categoria) e feito em memoria, em centavos.
    const starts = budgets.map((b) => b.periodStart.getTime());
    const ends = budgets.map((b) => b.periodEnd.getTime());
    const expenses = await this.prisma.transaction.findMany({
      where: {
        financialSpaceId: spaceId,
        type: 'expense',
        status: 'confirmed',
        effectiveDate: { gte: new Date(Math.min(...starts)), lte: new Date(Math.max(...ends)) },
      },
      select: { categoryId: true, totalAmount: true, effectiveDate: true },
    });

    const entries = budgets.map((budget) => {
      const start = budget.periodStart.getTime();
      const end = budget.periodEnd.getTime();
      const spentCents = expenses.reduce((acc, expense) => {
        const at = expense.effectiveDate.getTime();
        if (at < start || at > end) return acc;
        if (budget.categoryId !== null && expense.categoryId !== budget.categoryId) return acc;
        return acc + cents(expense.totalAmount);
      }, 0);

      const input: BudgetInput = {
        id: budget.id,
        categoryId: budget.categoryId,
        categoryName: budget.category?.name ?? null,
        periodStart: iso(budget.periodStart),
        periodEnd: iso(budget.periodEnd),
        amountLimit: budget.amountLimit.toString(),
      };
      return { budget: input, spentCents };
    });

    return buildBudgetsView(window, entries);
  }
}

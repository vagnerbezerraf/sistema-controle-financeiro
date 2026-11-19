import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { toDate } from '../common/utils/date';
import { buildMonthlyComparison, monthRange, previousMonth } from './domain/monthly-comparison';

const cents = (value: Prisma.Decimal | string | number): number => Math.round(Number(value) * 100);
const amount = (value: number): string => (value / 100).toFixed(2);

/**
 * Leitura derivada das comparacoes mensais: le os totais realizados (despesas
 * e receitas confirmadas) do mes corrente e do anterior em uma unica consulta e
 * recorta em memoria. Fica em um servico proprio para poder ser reusado sem
 * duplicar a consulta.
 */
@Injectable()
export class MonthlyComparisonService {
  constructor(private readonly prisma: PrismaClient) {}

  async compare(spaceId: string, month: string) {
    const current = monthRange(month);
    const previous = monthRange(previousMonth(month));

    // Uma unica leitura cobre os dois meses; o recorte por mes e em memoria.
    const transactions = await this.prisma.transaction.findMany({
      where: {
        financialSpaceId: spaceId,
        status: 'confirmed',
        type: { in: ['income', 'expense'] },
        effectiveDate: { gte: toDate(previous.from), lte: toDate(current.to) },
      },
      select: { type: true, totalAmount: true, effectiveDate: true },
    });

    const sumRange = (from: string, to: string) => {
      const fromMs = toDate(from).getTime();
      const toMs = toDate(to).getTime();
      let income = 0;
      let expense = 0;
      for (const transaction of transactions) {
        const at = transaction.effectiveDate.getTime();
        if (at < fromMs || at > toMs) continue;
        if (transaction.type === 'income') income += cents(transaction.totalAmount);
        else expense += cents(transaction.totalAmount);
      }
      return { income, expense };
    };

    const currentTotals = sumRange(current.from, current.to);
    const previousTotals = sumRange(previous.from, previous.to);

    return buildMonthlyComparison(
      {
        month,
        periodStart: current.from,
        periodEnd: current.to,
        income: amount(currentTotals.income),
        expense: amount(currentTotals.expense),
      },
      {
        month: previousMonth(month),
        periodStart: previous.from,
        periodEnd: previous.to,
        income: amount(previousTotals.income),
        expense: amount(previousTotals.expense),
      },
    );
  }
}

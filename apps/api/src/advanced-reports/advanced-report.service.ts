import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import type { AccountType, AdvancedReportView } from '@scf/api-contracts';
import { toDate } from '../common/utils/date';
import { monthRange } from '../monthly-comparison/domain/monthly-comparison';
import { CurrencyService } from '../currency/currency.service';
import { convertCents } from '../currency/domain/exchange-rate';
import {
  buildAdvancedReport,
  buildEvolution,
  computeNetWorth,
  computeSavingsRate,
  DEFAULT_EVOLUTION_MONTHS,
  recentMonths,
  type MonthTotals,
} from './domain/advanced-report';

const cents = (value: Prisma.Decimal | string | number): number => Math.round(Number(value) * 100);
const amount = (value: number): string => (value / 100).toFixed(2);

/**
 * Leitura derivada dos relatorios avancados: reune, em uma unica leitura por
 * eixo, o patrimonio liquido (postings confirmados por conta ativa), a taxa de
 * poupanca do mes e a evolucao mensal. Fica em um servico proprio para poder
 * ser reusado sem duplicar as consultas.
 *
 * Tudo e apresentado na moeda de reporte do espaco: os saldos por conta e os
 * totais mensais sao convertidos pela taxa vigente (patrimonio usa a data de
 * hoje; a evolucao usa a data do lancamento). Valores sem taxa de cambio ficam
 * fora das somas para nao misturar moedas.
 */
@Injectable()
export class AdvancedReportService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly currency: CurrencyService,
  ) {}

  async build(
    spaceId: string,
    options: { month?: string; months?: number } = {},
  ): Promise<AdvancedReportView> {
    const month = options.month ?? new Date().toISOString().slice(0, 7);
    const months = options.months ?? DEFAULT_EVOLUTION_MONTHS;

    const series = recentMonths(month, months);
    const rangeStart = monthRange(series[0]).from;
    const rangeEnd = monthRange(month).to;

    const { baseCurrency, rates } = await this.currency.loadContext(spaceId);
    const accounts = await this.prisma.account.findMany({
      where: { financialSpaceId: spaceId, state: 'active' },
      select: { id: true, name: true, type: true, currency: true },
      orderBy: [{ createdAt: 'asc' }],
    });
    const accountIds = accounts.map((account) => account.id);

    const [postings, transactions] = await Promise.all([
      // Todos os postings confirmados de contas ativas: e a posicao atual.
      accountIds.length === 0
        ? Promise.resolve([])
        : this.prisma.posting.findMany({
            where: { accountId: { in: accountIds }, transaction: { status: 'confirmed' } },
            select: { accountId: true, amount: true, direction: true },
          }),
      this.prisma.transaction.findMany({
        where: {
          financialSpaceId: spaceId,
          status: 'confirmed',
          type: { in: ['income', 'expense'] },
          effectiveDate: { gte: toDate(rangeStart), lte: toDate(rangeEnd) },
        },
        select: { type: true, totalAmount: true, effectiveDate: true, currency: true },
      }),
    ]);

    // Saldo por conta: o debito aumenta e o credito diminui. O cartao ja fica
    // negativo (a divida) porque a compra credita a conta tecnica.
    const balanceByAccount = new Map<string, number>();
    for (const posting of postings) {
      const value = cents(posting.amount);
      const delta = posting.direction === 'debit' ? value : -value;
      balanceByAccount.set(posting.accountId, (balanceByAccount.get(posting.accountId) ?? 0) + delta);
    }

    // Posicao atual: converte o saldo de cada conta pela taxa de hoje.
    const today = new Date().toISOString();
    const netWorth = computeNetWorth(
      baseCurrency,
      accounts.map((account) => {
        const balanceCents = balanceByAccount.get(account.id) ?? 0;
        const converted = convertCents(balanceCents, account.currency, baseCurrency, rates, today);
        return {
          id: account.id,
          name: account.name,
          type: account.type as AccountType,
          currency: account.currency,
          balance: amount(balanceCents),
          balanceInBase: converted === null ? null : amount(converted),
        };
      }),
    );

    // Totais confirmados por competencia (receitas e despesas), so para os meses
    // da serie; o recorte por mes e em memoria e cada valor e convertido para a
    // moeda de reporte pela taxa vigente na data do lancamento.
    const totals: Record<string, MonthTotals> = {};
    for (const monthKey of series) totals[monthKey] = { income: '0.00', expense: '0.00' };
    const centsByMonth = new Map<string, { income: number; expense: number }>();
    for (const transaction of transactions) {
      const key = transaction.effectiveDate.toISOString().slice(0, 7);
      if (!(key in totals)) continue;
      const converted = convertCents(
        cents(transaction.totalAmount),
        transaction.currency,
        baseCurrency,
        rates,
        transaction.effectiveDate.toISOString(),
      );
      if (converted === null) continue;
      const bucket = centsByMonth.get(key) ?? { income: 0, expense: 0 };
      if (transaction.type === 'income') bucket.income += converted;
      else bucket.expense += converted;
      centsByMonth.set(key, bucket);
    }
    for (const [key, bucket] of centsByMonth) {
      totals[key] = { income: amount(bucket.income), expense: amount(bucket.expense) };
    }

    const savings = computeSavingsRate(month, totals[month]?.income ?? '0.00', totals[month]?.expense ?? '0.00');
    const evolution = buildEvolution(series, totals);

    return buildAdvancedReport(month, netWorth, savings, evolution);
  }
}

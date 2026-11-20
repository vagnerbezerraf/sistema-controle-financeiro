/**
 * Relatorios avancados (Fase 4).
 *
 * Como as comparacoes mensais, e uma **leitura derivada**: nada e gravado e
 * nenhum job e necessario. Reune tres visoes que olham o dinheiro por angulos
 * complementares: o patrimonio liquido (posicao atual, ativos menos passivos),
 * a taxa de poupanca (quanto do que entrou sobrou no mes) e a evolucao mensal
 * (a tendencia dos ultimos meses).
 *
 * As somas sao feitas em centavos (inteiros), pela razao habitual do dominio: a
 * representacao binaria de decimais nao e confiavel para dinheiro.
 */
import type {
  AccountType,
  AdvancedReportView,
  CurrencyCode,
  MonthlyEvolutionPoint,
  NetWorthAccount,
  NetWorthView,
  SavingsRateView,
} from '@scf/api-contracts';

/** Quantos meses a evolucao cobre por padrao. */
export const DEFAULT_EVOLUTION_MONTHS = 6;
/** Limite superior aceito para a evolucao. */
export const MAX_EVOLUTION_MONTHS = 24;

const cents = (amount: string): number => Math.round(Number(amount) * 100);
const toAmount = (value: number): string => (value / 100).toFixed(2);

/** Conta ativa com o saldo realizado e a conversao para a moeda de reporte. */
export interface NetWorthAccountInput {
  id: string;
  name: string;
  type: AccountType;
  /** Moeda da conta; `balance` esta nessa moeda. */
  currency: CurrencyCode;
  /** Saldo assinado: positivo em ativos, negativo em passivos (cartao). */
  balance: string;
  /** Saldo ja convertido para a moeda de reporte; `null` quando nao ha taxa. */
  balanceInBase: string | null;
}

/** Totais realizados de um mes, ja normalizados pelo chamador. */
export interface MonthTotals {
  income: string;
  expense: string;
}

/** Um cartao de credito e um passivo; as demais contas sao ativos. */
export function isLiabilityAccount(type: AccountType): boolean {
  return type === 'credit_card';
}

/**
 * Patrimonio liquido = ativos - passivos, tudo na moeda de reporte
 * (`baseCurrency`). O saldo do cartao ja vem negativo (a divida), entao o
 * passivo e o modulo desse saldo — saldo positivo em um cartao (credito a
 * favor) nao vira passivo negativo. Uma conta sem taxa de cambio fica listada,
 * mas fora das somas: misturar moedas seria pior do que omitir.
 */
export function computeNetWorth(baseCurrency: CurrencyCode, accounts: NetWorthAccountInput[]): NetWorthView {
  let assets = 0;
  let liabilities = 0;
  const rows: NetWorthAccount[] = [];

  for (const account of accounts) {
    const balance = cents(account.balance);
    if (account.balanceInBase !== null) {
      const converted = cents(account.balanceInBase);
      if (isLiabilityAccount(account.type)) liabilities += Math.max(0, -converted);
      else assets += converted;
    }

    rows.push({
      accountId: account.id,
      name: account.name,
      type: account.type,
      currency: account.currency,
      balance: toAmount(balance),
      balanceInBase: account.balanceInBase,
    });
  }

  return {
    currency: baseCurrency,
    assets: toAmount(assets),
    liabilities: toAmount(liabilities),
    netWorth: toAmount(assets - liabilities),
    accounts: rows,
  };
}

/**
 * Taxa de poupanca = (receitas - despesas) / receitas. `null` quando nao houve
 * receita no mes (nao ha base de comparacao) — igual as comparacoes mensais.
 */
export function computeSavingsRate(month: string, income: string, expense: string): SavingsRateView {
  const incomeCents = cents(income);
  const expenseCents = cents(expense);
  const saved = incomeCents - expenseCents;

  return {
    month,
    income: toAmount(incomeCents),
    expense: toAmount(expenseCents),
    saved: toAmount(saved),
    rate: incomeCents === 0 ? null : Number(((saved / incomeCents) * 100).toFixed(1)),
  };
}

/** Meses cobertos pela evolucao, em ordem crescente, terminando em `endMonth`. */
export function recentMonths(endMonth: string, count: number): string[] {
  const [year, monthNumber] = endMonth.split('-').map(Number);
  const months: string[] = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const date = new Date(Date.UTC(year, monthNumber - 1 - offset, 1));
    months.push(`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}

/** Serie mensal de receitas, despesas e liquido (meses sem movimento entram zerados). */
export function buildEvolution(
  months: string[],
  totals: Record<string, MonthTotals>,
): MonthlyEvolutionPoint[] {
  return months.map((month) => {
    const monthTotals = totals[month] ?? { income: '0', expense: '0' };
    const income = cents(monthTotals.income);
    const expense = cents(monthTotals.expense);
    return {
      month,
      income: toAmount(income),
      expense: toAmount(expense),
      net: toAmount(income - expense),
    };
  });
}

/** Monta a visao final a partir das tres partes ja calculadas. */
export function buildAdvancedReport(
  month: string,
  netWorth: NetWorthView,
  savings: SavingsRateView,
  evolution: MonthlyEvolutionPoint[],
): AdvancedReportView {
  return { month, netWorth, savings, evolution };
}

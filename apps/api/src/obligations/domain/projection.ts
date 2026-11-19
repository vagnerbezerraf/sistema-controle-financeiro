/**
 * Saldo projetado (Fase 3).
 *
 * Como o calendario e os alertas, e uma **leitura derivada**: nada e gravado e
 * nenhum job e necessario. A diferenca e o sentido do olhar — o orcamento olha
 * para tras (o que ja foi gasto), a projecao olha para frente: parte do saldo
 * realizado de hoje e caminha somando os compromissos em aberto (contas a
 * pagar/receber) pelo dia do vencimento.
 *
 * Faturas de cartao ficam de fora: a compra ja entra no saldo realizado como
 * despesa confirmada (no momento da compra), entao lancar tambem a fatura
 * contaria o mesmo dinheiro duas vezes. O chamador entrega apenas os
 * movimentos de caixa que ainda nao aconteceram.
 *
 * As somas sao feitas em centavos (inteiros) e as datas comparadas apenas pelo
 * dia (UTC), pela mesma razao do restante do dominio.
 */
import type { CalendarEntryInput } from './calendar';

/** Quantos dias a frente a projecao cobre por padrao. */
export const DEFAULT_PROJECTION_HORIZON_DAYS = 30;

/** Situacoes de obrigacao que ainda representam um compromisso em aberto. */
const OPEN_OBLIGATION_STATUSES = ['forecast', 'pending', 'partially_reconciled'];

const DAY_MS = 24 * 60 * 60 * 1000;
const isoDay = (value: string): string => value.slice(0, 10);
const cents = (value: string): number => Math.round(Number(value) * 100);
const amount = (value: number): string => (value / 100).toFixed(2);

export interface ProjectionPointView {
  date: string;
  inflow: string;
  outflow: string;
  net: string;
  balance: string;
}

export interface BalanceProjectionView {
  today: string;
  horizonDays: number;
  openingBalance: string;
  closingBalance: string;
  minBalance: string;
  minBalanceDate: string;
  willGoNegative: boolean;
  upcomingCount: number;
  upcomingAmount: string;
  points: ProjectionPointView[];
}

/** Somente compromissos ainda em aberto mexem no saldo projetado. */
function isOpen(entry: CalendarEntryInput): boolean {
  return OPEN_OBLIGATION_STATUSES.includes(entry.status);
}

function addDays(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Caminha o saldo de partida pelos compromissos em aberto dentro do horizonte.
 *
 * Vencimentos ja passados (dias < 0) sao jogados no dia de hoje — continuam
 * pendentes e ainda vao mexer no saldo. O que esta alem de `hoje + horizonteDays`
 * e descartado. Devolve apenas os dias com movimento, mais o menor saldo do
 * horizonte (que sinaliza se a conta fica negativa em algum ponto).
 */
export function buildProjection(
  entries: CalendarEntryInput[],
  options: { openingBalance: string; today?: Date; horizonDays?: number },
): BalanceProjectionView {
  const today = (options.today ?? new Date()).toISOString().slice(0, 10);
  const horizonDays = options.horizonDays ?? DEFAULT_PROJECTION_HORIZON_DAYS;
  const horizonEnd = addDays(today, horizonDays);

  const openingCents = cents(options.openingBalance);

  const buckets = new Map<string, { inflow: number; outflow: number }>();
  let upcomingCount = 0;
  let upcomingAmount = 0;

  for (const entry of entries) {
    if (!isOpen(entry)) continue;
    const due = isoDay(entry.dueDate);
    if (due > horizonEnd) continue;

    const day = due < today ? today : due;
    const value = cents(entry.amount);
    const bucket = buckets.get(day) ?? { inflow: 0, outflow: 0 };
    if (entry.type === 'income') bucket.inflow += value;
    else bucket.outflow += value;
    buckets.set(day, bucket);

    upcomingCount += 1;
    if (entry.type === 'expense') upcomingAmount += value;
  }

  const points: ProjectionPointView[] = [];
  let balance = openingCents;
  let minBalance = openingCents;
  let minBalanceDate = today;

  for (const day of [...buckets.keys()].sort((a, b) => a.localeCompare(b))) {
    const bucket = buckets.get(day)!;
    balance += bucket.inflow - bucket.outflow;
    points.push({
      date: day,
      inflow: amount(bucket.inflow),
      outflow: amount(bucket.outflow),
      net: amount(bucket.inflow - bucket.outflow),
      balance: amount(balance),
    });
    if (balance < minBalance) {
      minBalance = balance;
      minBalanceDate = day;
    }
  }

  return {
    today,
    horizonDays,
    openingBalance: amount(openingCents),
    closingBalance: amount(balance),
    minBalance: amount(minBalance),
    minBalanceDate,
    willGoNegative: minBalance < 0,
    upcomingCount,
    upcomingAmount: amount(upcomingAmount),
    points,
  };
}

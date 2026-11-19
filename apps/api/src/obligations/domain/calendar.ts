/**
 * Montagem do calendario financeiro.
 *
 * O calendario nao guarda estado: e uma **visao agregada** das entradas
 * previstas (contas a pagar/receber) e das faturas de cartao, agrupadas pelo
 * dia de vencimento. Manter a agregacao como funcao pura (sem banco) permite
 * testar as somas e o recorte de periodo isoladamente.
 *
 * As somas sao feitas em centavos (inteiros) pela mesma razao do restante do
 * dominio: a representacao binaria de decimais nao e confiavel para dinheiro.
 */

/** Entrada ja normalizada pelo chamador, pronta para entrar no calendario. */
export interface CalendarEntryInput {
  kind: 'obligation' | 'invoice';
  id: string;
  description: string;
  type: 'income' | 'expense';
  amount: string;
  status: string;
  overdue: boolean;
  dueDate: string;
}

export interface CalendarDayView {
  date: string;
  incomeTotal: string;
  expenseTotal: string;
  entries: CalendarEntryInput[];
}

export interface CalendarView {
  from: string;
  to: string;
  days: CalendarDayView[];
  totals: {
    income: string;
    expense: string;
    net: string;
    entryCount: number;
    overdueCount: number;
  };
}

const iso = (date: Date): string => date.toISOString().slice(0, 10);
const isoDay = (value: string): string => value.slice(0, 10);
const cents = (amount: string): number => Math.round(Number(amount) * 100);

/**
 * Janela padrao do calendario: o mes corrente (do 1o ao ultimo dia) em UTC.
 * Usada quando o cliente nao informa `from`/`to`.
 */
export function defaultMonthRange(today: Date = new Date()): { from: string; to: string } {
  const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const last = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0));
  return { from: iso(first), to: iso(last) };
}

/**
 * Agrupa as entradas por dia de vencimento dentro de `[from, to]`, somando os
 * totais de cada dia e do periodo. Entradas fora da janela sao descartadas.
 */
export function buildCalendar(
  entries: CalendarEntryInput[],
  range: { from: string; to: string },
): CalendarView {
  const from = isoDay(range.from);
  const to = isoDay(range.to);

  const buckets = new Map<
    string,
    { income: number; expense: number; entries: CalendarEntryInput[] }
  >();

  for (const entry of entries) {
    const date = isoDay(entry.dueDate);
    if (date < from || date > to) continue;

    const bucket = buckets.get(date) ?? { income: 0, expense: 0, entries: [] };
    const value = cents(entry.amount);
    if (entry.type === 'income') bucket.income += value;
    else bucket.expense += value;
    bucket.entries.push({ ...entry, dueDate: date });
    buckets.set(date, bucket);
  }

  const days = [...buckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, bucket]) => ({
      date,
      incomeTotal: (bucket.income / 100).toFixed(2),
      expenseTotal: (bucket.expense / 100).toFixed(2),
      entries: bucket.entries,
    }));

  const income = days.reduce((acc, day) => acc + cents(day.incomeTotal), 0);
  const expense = days.reduce((acc, day) => acc + cents(day.expenseTotal), 0);
  const entryCount = days.reduce((acc, day) => acc + day.entries.length, 0);
  const overdueCount = days.reduce(
    (acc, day) => acc + day.entries.filter((entry) => entry.overdue).length,
    0,
  );

  return {
    from,
    to,
    days,
    totals: {
      income: (income / 100).toFixed(2),
      expense: (expense / 100).toFixed(2),
      net: ((income - expense) / 100).toFixed(2),
      entryCount,
      overdueCount,
    },
  };
}

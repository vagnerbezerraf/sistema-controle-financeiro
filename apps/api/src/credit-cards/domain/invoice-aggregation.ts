/**
 * Montagem das faturas a partir dos movimentos da conta tecnica do cartao.
 *
 * Conforme doc/05-modelo-de-dominio.md, a fatura e uma **agregacao** das
 * compras do cartao no periodo, nao uma entidade que armazena cobrancas
 * individuais. Por isso as faturas sao derivadas aqui, em memoria, e nao
 * persistidas: qualquer alteracao nas compras se reflete imediatamente, sem
 * risco de divergencia entre a tabela `invoices` e as transacoes.
 *
 * Convencao de sinais (a mesma das contas): na conta do cartao uma compra e um
 * movimento `credit` (aumenta o que se deve) e um pagamento/estorno e um
 * movimento `debit` (reduz a divida). Assim o cartao se comporta como qualquer
 * outra conta no restante do sistema.
 */
import {
  closingDateOnOrAfter,
  cycleWindow,
  dueDateFor,
  invoiceIdFor,
  invoiceStatus,
  toUtcDateOnly,
  type InvoiceStatus,
} from './billing-cycle';
import { allocatePaymentsFifo, round2, type InvoiceChargeLine } from './invoice-allocation';

/** Movimento da conta do cartao, ja normalizado e com valor absoluto. */
export interface InvoicePosting {
  amount: number;
  direction: 'debit' | 'credit';
  effectiveDate: Date;
}

/** Fatura pronta para o contrato HTTP (datas como `YYYY-MM-DD`, valores com 2 casas). */
export interface InvoiceView {
  id: string;
  closingDate: string;
  cycleStart: string;
  cycleEnd: string;
  dueDate: string;
  totalAmount: string;
  paidAmount: string;
  outstandingAmount: string;
  status: InvoiceStatus;
}

const iso = (date: Date): string => toUtcDateOnly(date).toISOString().slice(0, 10);

/**
 * Agrupa as compras por ciclo de fechamento e distribui os pagamentos em
 * cascata (FIFO), devolvendo as faturas da mais recente para a mais antiga.
 */
export function assembleInvoices(opts: {
  postings: InvoicePosting[];
  closingDay: number;
  dueDay: number;
  now: Date;
}): InvoiceView[] {
  const cycles = new Map<string, { closingDate: Date; totalCents: number }>();

  for (const posting of opts.postings) {
    if (posting.direction !== 'credit') continue;
    const closingDate = closingDateOnOrAfter(toUtcDateOnly(posting.effectiveDate), opts.closingDay);
    const id = invoiceIdFor(closingDate);
    const cycle = cycles.get(id) ?? { closingDate, totalCents: 0 };
    cycle.totalCents += Math.round(posting.amount * 100);
    cycles.set(id, cycle);
  }

  const totalPaidCents = opts.postings
    .filter((p) => p.direction === 'debit')
    .reduce((acc, p) => acc + Math.round(p.amount * 100), 0);

  const lines: InvoiceChargeLine[] = [...cycles.entries()].map(([id, cycle]) => ({
    id,
    closingDate: cycle.closingDate,
    total: cycle.totalCents / 100,
  }));
  const applied = allocatePaymentsFifo(lines, totalPaidCents / 100);

  return [...cycles.entries()]
    .sort((a, b) => a[1].closingDate.getTime() - b[1].closingDate.getTime())
    .map(([id, cycle]) => {
      const total = cycle.totalCents / 100;
      const paid = round2(applied.get(id) ?? 0);
      const { cycleStart, cycleEnd } = cycleWindow(cycle.closingDate, opts.closingDay);
      const dueDate = dueDateFor(cycle.closingDate, opts.dueDay);
      return {
        id,
        closingDate: id,
        cycleStart: iso(cycleStart),
        cycleEnd: iso(cycleEnd),
        dueDate: iso(dueDate),
        totalAmount: total.toFixed(2),
        paidAmount: paid.toFixed(2),
        outstandingAmount: Math.max(0, round2(total - paid)).toFixed(2),
        status: invoiceStatus({ total, paid, closingDate: cycle.closingDate, dueDate, now: opts.now }),
      };
    })
    .reverse();
}

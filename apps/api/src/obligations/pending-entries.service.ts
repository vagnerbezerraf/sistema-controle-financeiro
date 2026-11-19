import { Injectable } from '@nestjs/common';
import { Account, CreditCard, ObligationStatus, PrismaClient } from '@prisma/client';
import { startOfUtcDay } from '../common/utils/date';
import { assembleInvoices, type InvoicePosting } from '../credit-cards/domain/invoice-aggregation';
import type { CalendarEntryInput } from './domain/calendar';
import { isObligationOverdue } from './domain/obligation-status';

type CreditCardWithAccount = CreditCard & { account: Account };

/** Situacoes que nao representam mais um compromisso e ficam fora das visoes. */
const HIDDEN_OBLIGATION_STATUSES: ObligationStatus[] = ['canceled', 'ignored'];

const iso = (date: Date): string => date.toISOString().slice(0, 10);

/**
 * Reune os compromissos em aberto de um espaco (contas a pagar/receber e
 * faturas de cartao) que alimentam as visoes derivadas (calendario e alertas).
 *
 * Nada e persistido: a leitura parte sempre das obrigacoes e dos movimentos
 * reais, entao as visoes nunca divergem do estado real nem exigem um job.
 */
@Injectable()
export class PendingEntriesService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Entradas em aberto, opcionalmente recortadas por vencimento. As faturas de
   * cartao so entram quando ainda ha saldo devedor (a fatura quitada deixa de
   * ser um compromisso).
   */
  async listPending(
    spaceId: string,
    range?: { from?: string; to?: string },
  ): Promise<CalendarEntryInput[]> {
    const dueDate = {
      ...(range?.from ? { gte: startOfUtcDay(range.from) } : {}),
      ...(range?.to ? { lte: startOfUtcDay(range.to) } : {}),
    };

    const [obligations, cards] = await Promise.all([
      this.prisma.obligation.findMany({
        where: {
          financialSpaceId: spaceId,
          status: { notIn: HIDDEN_OBLIGATION_STATUSES },
          ...(range?.from || range?.to ? { dueDate } : {}),
        },
      }),
      this.prisma.creditCard.findMany({
        where: { account: { financialSpaceId: spaceId } },
        include: { account: true },
      }),
    ]);

    const entries: CalendarEntryInput[] = obligations.map((obligation) => ({
      kind: 'obligation',
      id: obligation.id,
      description: obligation.description,
      type: obligation.type === 'income' ? 'income' : 'expense',
      amount: obligation.amount.toString(),
      status: obligation.status,
      overdue: isObligationOverdue(obligation),
      dueDate: iso(obligation.dueDate),
    }));

    // Faturas de cartao sao derivadas das compras; entram pelo vencimento.
    for (const card of cards) {
      for (const invoice of await this.buildInvoices(card)) {
        if (range?.from && invoice.dueDate < range.from) continue;
        if (range?.to && invoice.dueDate > range.to) continue;
        if (Number(invoice.outstandingAmount) <= 0) continue;
        entries.push({
          kind: 'invoice',
          id: `${card.id}:${invoice.id}`,
          description: `Fatura ${card.name}`,
          type: 'expense',
          amount: invoice.outstandingAmount,
          status: invoice.status,
          overdue: invoice.status === 'overdue',
          dueDate: invoice.dueDate,
        });
      }
    }

    return entries;
  }

  /** Le os movimentos da conta do cartao e delega a montagem das faturas ao dominio. */
  private async buildInvoices(card: CreditCardWithAccount) {
    const postings = await this.prisma.posting.findMany({
      where: { accountId: card.accountId },
      select: { amount: true, direction: true, effectiveDate: true },
    });
    const normalized: InvoicePosting[] = postings.map((posting) => ({
      amount: Number(posting.amount),
      direction: posting.direction,
      effectiveDate: posting.effectiveDate,
    }));
    return assembleInvoices({
      postings: normalized,
      closingDay: card.closingDay,
      dueDay: card.dueDay,
      now: new Date(),
    });
  }
}

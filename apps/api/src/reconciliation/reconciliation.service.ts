import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaClient, type Obligation, type Transaction } from '@prisma/client';
import type {
  ApplyReconciliationResult,
  ObligationStatus,
  ObligationType,
  ReconciliationMatch,
  ReconciliationView,
} from '@scf/api-contracts';
import { isObligationOverdue, reconcileStatusFor } from '../obligations/domain/obligation-status';
import { OutboxService } from '../outbox/outbox.service';
import {
  buildReconciliationSuggestions,
  type MatchObligation,
  type MatchTransaction,
} from './domain/reconciliation-match';

/** Situacoes persistidas que ainda estao em aberto (candidatas a conciliacao). */
const OPEN_STATUSES = ['forecast', 'pending'] as const;

const iso = (date: Date) => date.toISOString().slice(0, 10);

/**
 * Servico de reconciliacao (conciliacao) entre contas previstas e itens de
 * importacao. Le as obrigacoes em aberto e os lancamentos confirmados criados
 * por lotes aplicados, sugere os casamentos mais provaveis (dominio puro) e
 * aplica a conciliacao reusando a mesma regra do fluxo de obrigacoes.
 */
@Injectable()
export class ReconciliationService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly outbox: OutboxService,
  ) {}

  /** Visao da conciliacao: candidatos + sugestoes automaticas 1:1. */
  async view(spaceId: string, batchId?: string): Promise<ReconciliationView> {
    const [obligations, { transactions, owner }] = await Promise.all([
      this.loadOpenObligations(spaceId),
      this.loadImportedTransactions(spaceId, batchId),
    ]);

    const suggestions = buildReconciliationSuggestions(
      obligations.map((obligation): MatchObligation => ({
        id: obligation.id,
        type: obligation.type,
        description: obligation.description,
        amount: obligation.amount.toString(),
        dueDate: obligation.dueDate,
      })),
      transactions.map((transaction): MatchTransaction => ({
        id: transaction.id,
        type: transaction.type,
        description: transaction.description,
        totalAmount: transaction.totalAmount.abs().toString(),
        effectiveDate: transaction.effectiveDate,
      })),
    );

    return {
      batchId: batchId ?? null,
      obligations: obligations.map((obligation) => ({
        id: obligation.id,
        description: obligation.description,
        type: obligation.type as ObligationType,
        amount: obligation.amount.toString(),
        dueDate: iso(obligation.dueDate),
        status: obligation.status as Exclude<ObligationStatus, 'overdue'>,
        overdue: isObligationOverdue(obligation),
      })),
      transactions: transactions.map((transaction) => ({
        id: transaction.id,
        description: transaction.description,
        type: transaction.type as ObligationType,
        totalAmount: transaction.totalAmount.abs().toFixed(2),
        effectiveDate: iso(transaction.effectiveDate),
        batchId: owner.get(transaction.id) ?? null,
      })),
      suggestions,
      counts: {
        high: suggestions.filter((s) => s.band === 'high').length,
        medium: suggestions.filter((s) => s.band === 'medium').length,
        low: suggestions.filter((s) => s.band === 'low').length,
      },
    };
  }

  /** Concilia manualmente os pares informados (conta prevista x item importado). */
  async apply(
    spaceId: string,
    userId: string,
    matches: ReconciliationMatch[],
  ): Promise<ApplyReconciliationResult> {
    if (new Set(matches.map((m) => m.obligationId)).size !== matches.length) {
      throw new BadRequestException({
        code: 'DUPLICATE_OBLIGATION',
        message: 'A mesma conta nao pode ser conciliada duas vezes no mesmo pedido',
      });
    }
    if (new Set(matches.map((m) => m.transactionId)).size !== matches.length) {
      throw new BadRequestException({
        code: 'DUPLICATE_TRANSACTION',
        message: 'O mesmo item nao pode conciliar duas contas no mesmo pedido',
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const applied: ApplyReconciliationResult['applied'] = [];
      for (const match of matches) {
        const obligation = await tx.obligation.findFirst({
          where: { id: match.obligationId, financialSpaceId: spaceId },
        });
        if (!obligation) throw new NotFoundException('Conta prevista nao encontrada');
        if (obligation.status === 'reconciled' || obligation.status === 'partially_reconciled') {
          throw new BadRequestException({
            code: 'ALREADY_RECONCILED',
            message: 'A conta ja foi conciliada',
          });
        }

        const transaction = await tx.transaction.findFirst({
          where: { id: match.transactionId, financialSpaceId: spaceId },
        });
        if (!transaction) throw new NotFoundException('Lancamento nao encontrado');
        if (transaction.status !== 'confirmed') {
          throw new BadRequestException({
            code: 'TRANSACTION_NOT_CONFIRMED',
            message: 'Apenas lancamentos confirmados podem conciliar uma conta',
          });
        }

        const takenBy = await tx.obligation.findFirst({ where: { transactionId: transaction.id } });
        if (takenBy && takenBy.id !== obligation.id) {
          throw new BadRequestException({
            code: 'TRANSACTION_ALREADY_RECONCILED',
            message: 'O lancamento ja esta vinculado a outra conta',
          });
        }

        const status = reconcileStatusFor(obligation.amount.toString(), transaction.totalAmount.abs().toString());
        const updated = await tx.obligation.update({
          where: { id: obligation.id },
          data: { transactionId: transaction.id, status, version: { increment: 1 } },
        });

        await tx.auditLog.create({
          data: {
            financialSpaceId: spaceId,
            userId,
            operation: 'obligation.reconcile',
            entityType: 'Obligation',
            entityId: updated.id,
            safeSummary: {
              transactionId: transaction.id,
              status: updated.status,
              amount: updated.amount.toString(),
              source: 'reconciliation',
            },
          },
        });

        await this.outbox.record(tx, {
          financialSpaceId: spaceId,
          eventType: 'obligation.reconciled',
          payload: { obligationId: updated.id, transactionId: transaction.id, status },
        });

        applied.push({ obligationId: updated.id, transactionId: transaction.id, status });
      }

      return { applied, appliedCount: applied.length };
    });
  }

  /** Conciliacao automatica: aplica os pares com alta confianca. */
  async auto(spaceId: string, userId: string, batchId?: string): Promise<ApplyReconciliationResult> {
    const view = await this.view(spaceId, batchId);
    const matches = view.suggestions
      .filter((suggestion) => suggestion.band === 'high')
      .map(({ obligationId, transactionId }) => ({ obligationId, transactionId }));
    if (matches.length === 0) return { applied: [], appliedCount: 0 };
    return this.apply(spaceId, userId, matches);
  }

  private loadOpenObligations(spaceId: string): Promise<Obligation[]> {
    return this.prisma.obligation.findMany({
      where: {
        financialSpaceId: spaceId,
        status: { in: [...OPEN_STATUSES] },
        transactionId: null,
      },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /**
   * Lancamentos confirmados criados por lotes aplicados e ainda nao
   * conciliados. Opcionalmente restrito a um lote (valida que ele existe e foi
   * aplicado). Devolve tambem o mapa lancamento -> lote de origem.
   */
  private async loadImportedTransactions(
    spaceId: string,
    batchId?: string,
  ): Promise<{ transactions: Transaction[]; owner: Map<string, string> }> {
    const where: Prisma.ImportBatchWhereInput = {
      financialSpaceId: spaceId,
      status: 'committed',
      ...(batchId ? { id: batchId } : {}),
    };
    const batches = await this.prisma.importBatch.findMany({
      where,
      select: { id: true, createdTransactionIds: true },
    });
    if (batchId && batches.length === 0) {
      throw new NotFoundException('Lote de importacao nao encontrado ou ainda nao aplicado');
    }

    const owner = new Map<string, string>();
    for (const batch of batches) {
      for (const id of batch.createdTransactionIds) owner.set(id, batch.id);
    }
    const ids = [...owner.keys()];
    if (ids.length === 0) return { transactions: [], owner };

    const transactions = await this.prisma.transaction.findMany({
      where: {
        id: { in: ids },
        financialSpaceId: spaceId,
        status: 'confirmed',
        type: { in: ['income', 'expense'] },
        reconciledObligation: { is: null },
      },
      orderBy: [{ effectiveDate: 'asc' }, { createdAt: 'asc' }],
    });
    return { transactions, owner };
  }
}

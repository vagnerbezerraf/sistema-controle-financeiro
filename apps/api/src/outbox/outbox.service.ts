import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/** Eventos de dominio registrados no outbox transacional. */
export type OutboxEventType =
  | 'recurrence.generated'
  | 'obligation.reconciled'
  | 'invoice.paid'
  | 'report.requested';

/**
 * Grava o evento na **mesma transacao** da escrita de negocio.
 *
 * Se a escrita falhar, o evento desaparece junto (nunca existe evento para algo
 * que nao aconteceu); se a publicacao falhar depois, o worker reprocessa o
 * evento ate concluir. E o que torna o "publicar depois" confiavel sem 2PC.
 */
@Injectable()
export class OutboxService {
  record(
    tx: Prisma.TransactionClient,
    input: { financialSpaceId: string; eventType: OutboxEventType; payload: Prisma.InputJsonValue },
  ) {
    return tx.outboxEvent.create({
      data: {
        financialSpaceId: input.financialSpaceId,
        eventType: input.eventType,
        payload: input.payload,
      },
    });
  }
}

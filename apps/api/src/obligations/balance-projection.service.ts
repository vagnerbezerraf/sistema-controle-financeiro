import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import {
  buildProjection,
  DEFAULT_PROJECTION_HORIZON_DAYS,
  type BalanceProjectionView,
} from './domain/projection';
import type { CalendarEntryInput } from './domain/calendar';
import { PendingEntriesService } from './pending-entries.service';

/** Insumos crus da projecao (saldo de partida + compromissos em aberto). */
export interface ProjectionInputs {
  openingBalance: string;
  entries: CalendarEntryInput[];
}

/** Inicio (exclusivo) da janela de saldo realizado: amanha, em UTC. */
function startOfTomorrow(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}

/** Fim (inclusive) do horizonte de projecao: hoje + horizonte, em UTC. */
function horizonEnd(horizonDays: number, now: Date): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + horizonDays),
  )
    .toISOString()
    .slice(0, 10);
}

/**
 * Monta o saldo projetado de um espaco: le o saldo realizado (tudo confirmado
 * ate hoje) e os compromissos em aberto dentro do horizonte, e delega o calculo
 * ao dominio puro. Fica em um servico proprio para ser reaproveitado pela
 * projecao, pelos alertas de planejamento e pelos cenarios sem duplicar a leitura.
 */
@Injectable()
export class BalanceProjectionService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly pendingEntries: PendingEntriesService,
  ) {}

  /**
   * Le os insumos crus da projecao: o saldo realizado (tudo confirmado ate hoje)
   * e os compromissos em aberto dentro do horizonte. Extraido de `build` para ser
   * reaproveitado pelos cenarios, que aplicam ajustes hipoteticos sobre a mesma
   * leitura sem duplicar consultas.
   */
  async load(
    spaceId: string,
    options: { horizonDays?: number; now?: Date } = {},
  ): Promise<ProjectionInputs> {
    const horizonDays = options.horizonDays ?? DEFAULT_PROJECTION_HORIZON_DAYS;
    const now = options.now ?? new Date();

    const [confirmed, entries] = await Promise.all([
      this.prisma.transaction.findMany({
        where: {
          financialSpaceId: spaceId,
          status: 'confirmed',
          effectiveDate: { lt: startOfTomorrow(now) },
        },
        select: { type: true, totalAmount: true },
      }),
      this.pendingEntries.listPending(spaceId, { to: horizonEnd(horizonDays, now) }),
    ]);

    // Faturas de cartao ficam de fora: a compra ja e uma despesa confirmada no
    // saldo realizado, entao a fatura contaria o mesmo dinheiro duas vezes.
    const obligations = entries.filter((entry) => entry.kind === 'obligation');

    // Transferencias nao alteram o saldo agregado (so movem entre contas).
    let opening = 0;
    for (const transaction of confirmed) {
      const value = Number(transaction.totalAmount);
      if (transaction.type === 'expense') opening -= value;
      else if (transaction.type === 'income' || transaction.type === 'adjustment') opening += value;
    }

    return { openingBalance: opening.toFixed(2), entries: obligations };
  }

  async build(
    spaceId: string,
    options: { horizonDays?: number; now?: Date } = {},
  ): Promise<BalanceProjectionView> {
    const horizonDays = options.horizonDays ?? DEFAULT_PROJECTION_HORIZON_DAYS;
    const now = options.now ?? new Date();

    const inputs = await this.load(spaceId, { horizonDays, now });

    return buildProjection(inputs.entries, {
      openingBalance: inputs.openingBalance,
      today: now,
      horizonDays,
    });
  }
}

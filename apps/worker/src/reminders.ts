/**
 * Lembretes proativos de vencimento no worker (Fase 2).
 *
 * O job periodico percorre os espacos ativos, seleciona as obrigacoes em aberto
 * que vencem no horizonte (incluindo atrasadas ate o retrospecto) e envia um
 * lembrete para cada membro que aceita e-mail e nao esta em horario silencioso.
 *
 * A decisao (selecao + quiet hours + texto) vive no dominio puro
 * (`./domain/reminders`); aqui ficam a orquestracao e a persistencia atras de um
 * store injetavel — o mesmo desenho do drainer do outbox — testavel sem banco.
 *
 * Idempotencia: um lembrete por espaco por dia (UTC). O processador consulta o
 * ultimo envio gravado e nao repete no mesmo dia, de modo que reexecutar o job
 * (ou reagendar o repetivel) nao duplica e-mails; o envio fica registrado no
 * audit log (reuso de tabela ja existente, sem migracao).
 */
import type { PrismaClient } from '@prisma/client';
import {
  DEFAULT_OVERDUE_LOOKBACK_DAYS,
  DEFAULT_REMINDER_HORIZON_DAYS,
  OPEN_OBLIGATION_STATUSES,
  buildReminderMessage,
  selectDueObligations,
  shouldRemindNow,
  type DueObligation,
  type ReminderMessage,
  type ReminderRecipient,
} from './domain/reminders';

export const REMINDER_OPERATION = 'notification.reminder_sent';
export const REMINDER_ENTITY_TYPE = 'Notification';

const DAY_MS = 24 * 60 * 60 * 1000;
const isoDayOf = (date: Date): string => date.toISOString().slice(0, 10);
const startOfUtcDay = (day: string): Date => new Date(`${day}T00:00:00.000Z`);
const shiftDays = (date: Date, days: number): Date => new Date(date.getTime() + days * DAY_MS);

/** Abstrai a persistencia dos lembretes (implementado sobre o Prisma). */
export interface ReminderStore {
  /** Ids dos espacos ativos que devem ser avaliados. */
  listActiveSpaces(): Promise<string[]>;
  /** Obrigacoes em aberto com vencimento na janela `[fromIso, toIso]`. */
  findOpenObligations(spaceId: string, fromIso: string, toIso: string): Promise<DueObligation[]>;
  /** Destinatarios do espaco (membros ativos com as preferencias resolvidas). */
  findRecipients(spaceId: string): Promise<ReminderRecipient[]>;
  /** Dia (UTC) do ultimo lembrete gravado para o espaco, ou null se nunca envio. */
  findLastReminderDay(spaceId: string): Promise<string | null>;
  /** Registra que o espaco foi lembrado no dia (base da idempotencia). */
  recordReminder(spaceId: string, day: string, at: Date, sent: number): Promise<void>;
}

/** Envia o lembrete (a transportadora real fica atras desta interface). */
export interface ReminderNotifier {
  send(message: ReminderMessage): Promise<void>;
}

/** Logger minimo aceito pelo processador (compativel com o pino do worker). */
export interface ReminderLogger {
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
  error(obj: Record<string, unknown>, msg: string): void;
}

export interface ReminderProcessorDeps {
  store: ReminderStore;
  notifier: ReminderNotifier;
  logger: ReminderLogger;
  /** Injetavel para testes; padrao = relogio do sistema. */
  now?: () => Date;
  horizonDays?: number;
  overdueLookbackDays?: number;
}

export interface ReminderRunResult {
  spaces: number;
  sent: number;
  skipped: number;
}

export interface ReminderSpaceResult {
  spaceId: string;
  day: string;
  /** true quando o espaco ja havia sido lembrado neste dia. */
  skipped: boolean;
  obligations: number;
  recipients: number;
  sent: number;
}

export interface ReminderProcessor {
  /** Avalia todos os espacos ativos (ciclo periodico). */
  runAll(): Promise<ReminderRunResult>;
  /** Avalia um espaco (job pontual pelo `spaceId`). */
  runSpace(spaceId: string): Promise<ReminderSpaceResult>;
}

/**
 * Percorre os espacos e envia os lembretes devidos. Cada espaco e resolvido de
 * forma independente e no maximo uma vez por dia; um espaco sem obrigacoes a
 * vencer nao e marcado, entao a proxima execucao volta a avalia-lo.
 */
export function createReminderProcessor(deps: ReminderProcessorDeps): ReminderProcessor {
  const now = deps.now ?? (() => new Date());
  const horizonDays = deps.horizonDays ?? DEFAULT_REMINDER_HORIZON_DAYS;
  const overdueLookbackDays = deps.overdueLookbackDays ?? DEFAULT_OVERDUE_LOOKBACK_DAYS;

  async function runSpace(spaceId: string): Promise<ReminderSpaceResult> {
    const at = now();
    const day = isoDayOf(at);
    const empty: ReminderSpaceResult = { spaceId, day, skipped: false, obligations: 0, recipients: 0, sent: 0 };

    if ((await deps.store.findLastReminderDay(spaceId)) === day) {
      deps.logger.info({ spaceId, day }, 'Espaco ja lembrado hoje');
      return { ...empty, skipped: true };
    }

    const candidates = await deps.store.findOpenObligations(
      spaceId,
      isoDayOf(shiftDays(at, -overdueLookbackDays)),
      isoDayOf(shiftDays(at, horizonDays)),
    );
    const due = selectDueObligations(candidates, { today: at, horizonDays, overdueLookbackDays });
    if (due.length === 0) return empty;

    const recipients = await deps.store.findRecipients(spaceId);
    let sent = 0;
    for (const recipient of recipients) {
      if (!shouldRemindNow(recipient, at)) continue;
      await deps.notifier.send(buildReminderMessage(recipient, due, at));
      sent += 1;
    }

    if (sent > 0) {
      await deps.store.recordReminder(spaceId, day, at, sent);
      deps.logger.info({ spaceId, day, obligations: due.length, sent }, 'Lembretes enviados');
    }

    return { spaceId, day, skipped: false, obligations: due.length, recipients: recipients.length, sent };
  }

  return {
    runSpace,

    async runAll(): Promise<ReminderRunResult> {
      const spaces = await deps.store.listActiveSpaces();
      let sent = 0;
      let skipped = 0;
      for (const spaceId of spaces) {
        const result = await runSpace(spaceId);
        if (result.skipped) skipped += 1;
        sent += result.sent;
      }
      deps.logger.info({ spaces: spaces.length, sent, skipped }, 'Ciclo de lembretes concluido');
      return { spaces: spaces.length, sent, skipped };
    },
  };
}

/** Store dos lembretes sobre o Prisma (mesmas tabelas que a API grava). */
export function createPrismaReminderStore(prisma: PrismaClient): ReminderStore {
  return {
    listActiveSpaces: async () => {
      const rows = await prisma.financialSpace.findMany({ where: { state: 'active' }, select: { id: true } });
      return rows.map((row) => row.id);
    },

    findOpenObligations: async (spaceId, fromIso, toIso) => {
      const rows = await prisma.obligation.findMany({
        where: {
          financialSpaceId: spaceId,
          status: { in: [...OPEN_OBLIGATION_STATUSES] },
          dueDate: { gte: startOfUtcDay(fromIso), lte: startOfUtcDay(toIso) },
        },
        orderBy: { dueDate: 'asc' },
      });
      return rows.map((row) => ({
        id: row.id,
        financialSpaceId: row.financialSpaceId,
        description: row.description,
        type: row.type === 'income' ? 'income' : 'expense',
        amount: row.amount.toFixed(2),
        currency: row.currency,
        dueDate: isoDayOf(row.dueDate),
        status: row.status,
      }));
    },

    findRecipients: async (spaceId) => {
      const members = await prisma.membership.findMany({
        where: { financialSpaceId: spaceId, status: 'active' },
        include: { user: { include: { notificationPreference: true } } },
      });
      return members.map(({ user }) => {
        const prefs = user.notificationPreference;
        // Tolerante a preferencias ausentes/parciais: o padrao e e-mail ligado.
        const channels = (prefs?.channels ?? {}) as Record<string, unknown>;
        const upcoming = (channels.upcoming_due ?? {}) as Record<string, unknown>;
        return {
          email: user.email,
          name: user.name ?? null,
          timezone: user.timezone,
          emailEnabled: typeof upcoming.email === 'boolean' ? upcoming.email : true,
          includeAmounts: prefs?.includeAmounts ?? true,
          quietHoursEnabled: prefs?.quietHoursEnabled ?? false,
          quietHoursStart: prefs?.quietHoursStart ?? '22:00',
          quietHoursEnd: prefs?.quietHoursEnd ?? '07:00',
        };
      });
    },

    findLastReminderDay: async (spaceId) => {
      const row = await prisma.auditLog.findFirst({
        where: { financialSpaceId: spaceId, operation: REMINDER_OPERATION },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      });
      return row ? isoDayOf(row.createdAt) : null;
    },

    recordReminder: async (spaceId, day, at, sent) => {
      await prisma.auditLog.create({
        data: {
          financialSpaceId: spaceId,
          operation: REMINDER_OPERATION,
          entityType: REMINDER_ENTITY_TYPE,
          entityId: spaceId,
          safeSummary: { day, sent, at: at.toISOString() },
        },
      });
    },
  };
}

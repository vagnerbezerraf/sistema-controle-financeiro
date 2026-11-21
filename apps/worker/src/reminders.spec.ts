import { describe, expect, it } from 'vitest';
import { createReminderProcessor, type ReminderNotifier, type ReminderStore } from './reminders';
import type { DueObligation, ReminderMessage, ReminderRecipient } from './domain/reminders';

const logger = { info: () => {}, warn: () => {}, error: () => {} };
/** Meio-dia UTC (09:00 em Sao Paulo): fora de qualquer horario silencioso padrao. */
const meioDia = new Date('2026-06-15T12:00:00.000Z');
/** 01:00 UTC = 22:00 em Sao Paulo: dentro do silencio padrao [22:00, 07:00). */
const noite = new Date('2026-06-16T01:00:00.000Z');

const obrigacao = (over: Partial<DueObligation> = {}): DueObligation => ({
  id: 'o1',
  financialSpaceId: 's1',
  description: 'Aluguel',
  type: 'expense',
  amount: '1500.00',
  currency: 'BRL',
  dueDate: '2026-06-16',
  status: 'pending',
  ...over,
});

const destinatario = (over: Partial<ReminderRecipient> = {}): ReminderRecipient => ({
  email: 'ana@example.com',
  name: 'Ana',
  timezone: 'America/Sao_Paulo',
  emailEnabled: true,
  includeAmounts: true,
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
  ...over,
});

/** Store em memoria que guarda o ultimo dia lembrado por espaco, como o banco. */
function makeStore(opts: {
  spaces?: string[];
  obligations?: Record<string, DueObligation[]>;
  recipients?: Record<string, ReminderRecipient[]>;
}) {
  const dias = new Map<string, string>();
  const records: { spaceId: string; day: string; sent: number }[] = [];
  const store: ReminderStore = {
    listActiveSpaces: async () => opts.spaces ?? [],
    findOpenObligations: async (spaceId) => opts.obligations?.[spaceId] ?? [],
    findRecipients: async (spaceId) => opts.recipients?.[spaceId] ?? [],
    findLastReminderDay: async (spaceId) => dias.get(spaceId) ?? null,
    recordReminder: async (spaceId, day, _at, sent) => {
      dias.set(spaceId, day);
      records.push({ spaceId, day, sent });
    },
  };
  return { store, records };
}

function makeNotifier() {
  const messages: ReminderMessage[] = [];
  const notifier: ReminderNotifier = {
    send: async (message) => {
      messages.push(message);
    },
  };
  return { notifier, messages };
}

describe('reminder processor (worker)', () => {
  it('envia um lembrete por destinatario elegivel e registra o dia', async () => {
    const { store, records } = makeStore({
      spaces: ['s1'],
      obligations: { s1: [obrigacao()] },
      recipients: {
        s1: [destinatario(), destinatario({ email: 'bia@example.com', name: 'Bia' })],
      },
    });
    const { notifier, messages } = makeNotifier();
    const processor = createReminderProcessor({ store, notifier, logger, now: () => meioDia });

    const result = await processor.runSpace('s1');

    expect(result).toEqual({
      spaceId: 's1',
      day: '2026-06-15',
      skipped: false,
      obligations: 1,
      recipients: 2,
      sent: 2,
    });
    expect(messages.map((m) => m.to)).toEqual(['ana@example.com', 'bia@example.com']);
    expect(messages[0].obligationIds).toEqual(['o1']);
    expect(records).toEqual([{ spaceId: 's1', day: '2026-06-15', sent: 2 }]);
  });

  it('e idempotente: o mesmo espaco nao e lembrado duas vezes no mesmo dia', async () => {
    const { store, records } = makeStore({
      spaces: ['s1'],
      obligations: { s1: [obrigacao()] },
      recipients: { s1: [destinatario()] },
    });
    const { notifier, messages } = makeNotifier();
    const processor = createReminderProcessor({ store, notifier, logger, now: () => meioDia });

    await processor.runSpace('s1');
    const segunda = await processor.runSpace('s1');

    expect(segunda).toMatchObject({ skipped: true, sent: 0 });
    expect(messages).toHaveLength(1);
    expect(records).toHaveLength(1);
  });

  it('pula destinatarios com e-mail desligado ou em horario silencioso', async () => {
    const { store } = makeStore({
      spaces: ['s1'],
      obligations: { s1: [obrigacao()] },
      recipients: {
        s1: [
          destinatario({ email: 'off@example.com', emailEnabled: false }),
          destinatario({ email: 'quiet@example.com', quietHoursEnabled: true }),
          destinatario({ email: 'ok@example.com' }),
        ],
      },
    });
    const { notifier, messages } = makeNotifier();
    // A noite (22:00 em Sao Paulo) fecha a janela silenciosa de `quiet@`.
    const processor = createReminderProcessor({ store, notifier, logger, now: () => noite });

    const result = await processor.runSpace('s1');

    expect(result.sent).toBe(1);
    expect(messages.map((m) => m.to)).toEqual(['ok@example.com']);
  });

  it('nao registra nada quando nao ha obrigacoes a vencer', async () => {
    const { store, records } = makeStore({
      spaces: ['s1'],
      obligations: { s1: [obrigacao({ dueDate: '2026-08-01' })] }, // alem do horizonte
      recipients: { s1: [destinatario()] },
    });
    const { notifier, messages } = makeNotifier();
    const processor = createReminderProcessor({ store, notifier, logger, now: () => meioDia });

    const result = await processor.runSpace('s1');

    expect(result).toMatchObject({ obligations: 0, sent: 0, skipped: false });
    expect(messages).toHaveLength(0);
    expect(records).toHaveLength(0);
  });

  it('runAll percorre os espacos ativos e agrega o resultado', async () => {
    const { store } = makeStore({
      spaces: ['s1', 's2'],
      obligations: {
        s1: [obrigacao()],
        s2: [obrigacao({ id: 'o2', financialSpaceId: 's2' })],
      },
      recipients: {
        s1: [destinatario()],
        s2: [destinatario({ email: 'bia@example.com' })],
      },
    });
    const { notifier, messages } = makeNotifier();
    const processor = createReminderProcessor({ store, notifier, logger, now: () => meioDia });

    const primeiro = await processor.runAll();
    expect(primeiro).toEqual({ spaces: 2, sent: 2, skipped: 0 });
    expect(messages).toHaveLength(2);

    const segundo = await processor.runAll();
    expect(segundo).toEqual({ spaces: 2, sent: 0, skipped: 2 });
    expect(messages).toHaveLength(2);
  });
});

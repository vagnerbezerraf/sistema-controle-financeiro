import 'dotenv/config';
import { bool, cleanEnv, host, num, str } from 'envalid';
import { Queue, Worker, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { pino } from 'pino';
import { createOutboxDrainer, createPrismaOutboxStore, type OutboxEventRecord } from './outbox';
import { createPrismaReportStore, createReportProcessor } from './reports';
import { createPrismaReportCacheStore, createReportCacheProcessor } from './report-cache';
import { createPrismaRecurrenceStore, createRecurrenceProcessor } from './recurrence';
import { createPrismaReminderStore, createReminderProcessor } from './reminders';
import { createMailNotifier, createMailSender } from './mail';

const logger = pino({ name: 'scf-worker' });

/** Intervalo do ciclo que drena o outbox transacional. */
const OUTBOX_POLL_INTERVAL_MS = 30_000;

/** Agenda diaria (cron) dos jobs periodicos, no fuso do negocio. */
const RECURRENCE_CRON = '0 3 * * *';
const REPORTS_CACHE_CRON = '0 4 * * *';
const REMINDER_CRON = '0 8 * * *';
const SCHEDULE_TZ = 'America/Sao_Paulo';

const env = cleanEnv(process.env, {
  REDIS_HOST: host({ default: '127.0.0.1' }),
  REDIS_PORT: num({ default: 6379 }),
  REDIS_PASSWORD: str({ default: '' }),
  NODE_ENV: str({ default: 'development', choices: ['development', 'production', 'test'] }),
  DATABASE_URL: str({ default: 'postgresql://scf:scf_dev_password@127.0.0.1:5432/scf?schema=public' }),
  // Envio de e-mail (lembretes de vencimento). Em dev aponte para o MailHog.
  MAIL_ENABLED: bool({ default: false }),
  MAIL_HOST: str({ default: 'localhost' }),
  MAIL_PORT: num({ default: 1025 }),
  MAIL_SECURE: bool({ default: false }),
  MAIL_USER: str({ default: '' }),
  MAIL_PASSWORD: str({ default: '' }),
  MAIL_FROM: str({ default: 'SCF <no-reply@scf.local>' }),
});

function makeRedis() {
  return new IORedis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
  });
}

const prisma = new PrismaClient({
  datasources: { db: { url: env.DATABASE_URL } },
});

type JobTypes = {
  'outbox:process': { cursorId?: string };
  'obligations:reminder': { spaceId?: string };
  'recurrence:generate': { ruleId?: string; upToDate?: string };
  'reports:cache': { retentionDays?: number };
};

type JobName = keyof JobTypes;

export const QUEUES = {
  outbox: 'scf.outbox',
  obligations: 'scf.obligations',
  recurrence: 'scf.recurrence',
  reports: 'scf.reports',
} as const;

type QueueKey = keyof typeof QUEUES;

const queuesByJob: Record<JobName, QueueKey> = {
  'outbox:process': 'outbox',
  'obligations:reminder': 'obligations',
  'recurrence:generate': 'recurrence',
  'reports:cache': 'reports',
};

const queueInstances: Record<string, Queue> = {};

export function getQueue(name: QueueKey): Queue {
  if (!queueInstances[name]) {
    queueInstances[name] = new Queue(QUEUES[name], { connection: makeRedis(), defaultJobOptions: { removeOnComplete: 200, removeOnFail: 500, attempts: 3, backoff: { type: 'exponential', delay: 5000 } } });
  }
  return queueInstances[name];
}

export async function enqueue<T extends JobName>(name: T, data: JobTypes[T], opts?: any) {
  const q = queuesByJob[name] ?? 'outbox';
  const queue = getQueue(q);
  return queue.add(name as string, data, opts);
}

async function bootstrap() {
  logger.info({ env: env.NODE_ENV }, 'Iniciando worker SCF...');

  await prisma.$connect().catch((e: unknown) => logger.warn({ err: (e as Error)?.message }, 'Prisma nao conectou (Redis standalone sem DB ok)'));

  const workers: Worker[] = [];
  const qevs: QueueEvents[] = [];

  // Gera os relatorios pedidos pela API (evento `report.requested` do outbox).
  const reportProcessor = createReportProcessor({
    store: createPrismaReportStore(prisma),
    logger,
  });

  // Estende as previsoes das regras de recorrencia ate `hoje + N meses`.
  const recurrenceProcessor = createRecurrenceProcessor({
    store: createPrismaRecurrenceStore(prisma),
    logger,
  });

  // Evicta o cache dos relatorios (conteudo CSV guardado no proprio job).
  const reportCacheProcessor = createReportCacheProcessor({
    store: createPrismaReportCacheStore(prisma),
    logger,
  });

  // Transporte de e-mail (SMTP/MailHog ou log em dev), usado nos lembretes.
  const mailSender = createMailSender({
    config: {
      enabled: env.MAIL_ENABLED,
      host: env.MAIL_HOST,
      port: env.MAIL_PORT,
      secure: env.MAIL_SECURE,
      user: env.MAIL_USER || undefined,
      password: env.MAIL_PASSWORD || undefined,
      from: env.MAIL_FROM,
    },
    logger,
  });

  // Envia os lembretes proativos de vencimento (uma vez por espaco e por dia).
  const reminderProcessor = createReminderProcessor({
    store: createPrismaReminderStore(prisma),
    notifier: createMailNotifier(mailSender),
    logger,
  });

  // Drena o outbox transacional gravado pela API na mesma transacao das
  // escritas de negocio. Ponto de extensao: aqui entrariam e-mails, webhooks,
  // notificacoes etc., todos disparados de forma confiavel (com retry).
  const outboxDrainer = createOutboxDrainer({
    store: createPrismaOutboxStore(prisma),
    dispatch: async (event: OutboxEventRecord) => {
      logger.info(
        { id: event.id, eventType: event.eventType, financialSpaceId: event.financialSpaceId },
        'Publicando evento do outbox',
      );
      if (event.eventType === 'report.requested') {
        const payload = (event.payload ?? {}) as { jobId?: string };
        await reportProcessor.process({ jobId: payload.jobId });
      }
    },
    logger,
  });

  const makeWorker = (name: QueueKey, handler: (jobName: string, data: any) => Promise<void>) => {
    const w = new Worker(
      QUEUES[name],
      async (job) => {
        logger.info({ name: job.name, id: job.id, queue: name }, 'Processando job');
        try {
          await handler(job.name, job.data);
        } catch (err: any) {
          logger.error({ err: err?.message, name: job.name, id: job.id }, 'Falha job');
          throw err;
        }
      },
      { connection: makeRedis(), concurrency: 4 },
    );
    const qev = new QueueEvents(QUEUES[name], { connection: makeRedis() });
    workers.push(w);
    qevs.push(qev);
    return w;
  };

  makeWorker('outbox', async () => {
    const result = await outboxDrainer.drainOnce();
    if (result.processed > 0) {
      logger.info(result, 'Lote do outbox processado');
    }
  });

  makeWorker('obligations', async (_name, data: { spaceId?: string }) => {
    // Com `spaceId`, avalia so aquele espaco (pedido pontual); sem, varre todos.
    if (data?.spaceId) {
      await reminderProcessor.runSpace(data.spaceId);
    } else {
      await reminderProcessor.runAll();
    }
  });

  makeWorker('recurrence', async (_name, data: { ruleId?: string; upToDate?: string }) => {
    // Com `ruleId`, materializa so aquela regra; sem, cobre todas as ativas.
    if (data?.ruleId) {
      await recurrenceProcessor.generateRule(data.ruleId, data.upToDate);
    } else {
      await recurrenceProcessor.generateAll();
    }
  });

  makeWorker('reports', async (_name, data: { retentionDays?: number }) => {
    await reportCacheProcessor.prune(data?.retentionDays);
  });

  // Agenda o ciclo do outbox como job repetivel (um por intervalo). O `add`
  // repetivel e idempotente por chave, entao reiniciar o worker nao acumula
  // agendamentos duplicados.
  await getQueue('outbox')
    .add('outbox:process', {}, { repeat: { every: OUTBOX_POLL_INTERVAL_MS }, removeOnComplete: true, removeOnFail: 100 })
    .catch((e: unknown) => logger.warn({ err: (e as Error)?.message }, 'Nao foi possivel agendar o ciclo do outbox'));

  // Jobs diarios: estender as previsoes das recorrencias de madrugada, evictar o
  // cache de relatorios e enviar os lembretes de vencimento pela manha. O `tz`
  // fixa a hora no fuso do negocio.
  await getQueue('recurrence')
    .add(
      'recurrence:generate',
      {},
      { repeat: { pattern: RECURRENCE_CRON, tz: SCHEDULE_TZ }, removeOnComplete: true, removeOnFail: 100 },
    )
    .catch((e: unknown) => logger.warn({ err: (e as Error)?.message }, 'Nao foi possivel agendar a geracao de recorrencias'));

  await getQueue('reports')
    .add(
      'reports:cache',
      {},
      { repeat: { pattern: REPORTS_CACHE_CRON, tz: SCHEDULE_TZ }, removeOnComplete: true, removeOnFail: 100 },
    )
    .catch((e: unknown) => logger.warn({ err: (e as Error)?.message }, 'Nao foi possivel agendar a limpeza do cache de relatorios'));

  await getQueue('obligations')
    .add(
      'obligations:reminder',
      {},
      { repeat: { pattern: REMINDER_CRON, tz: SCHEDULE_TZ }, removeOnComplete: true, removeOnFail: 100 },
    )
    .catch((e: unknown) => logger.warn({ err: (e as Error)?.message }, 'Nao foi possivel agendar os lembretes de vencimento'));

  const shutdown = async (sig: string) => {
    logger.info({ sig }, 'Encerrando worker...');
    await Promise.all([
      ...workers.map((w) => w.close()),
      ...qevs.map((q) => q.close()),
      ...Object.values(queueInstances).map((q) => q.close()),
    ]);
    await prisma.$disconnect().catch(() => {});
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  logger.info({ queues: Object.values(QUEUES) }, 'Workers prontos');
}

bootstrap().catch((e) => {
  logger.fatal({ err: e?.message }, 'Falha no bootstrap do worker');
  process.exit(1);
});

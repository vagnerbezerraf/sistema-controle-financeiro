/**
 * Estende as previsoes das regras de recorrencia (Fase 2).
 *
 * O horizonte de materializacao (12 meses) encurta conforme os dias passam,
 * entao este job periodico rematerializa as ocorrencias ate `hoje + N meses`
 * para todas as regras ativas — o que a API nao faz sozinha, pois so gera no
 * cadastro/edicao ou quando a UI pede explicitamente. A gravacao usa
 * `skipDuplicates` sobre o indice unico regra+vencimento, entao reexecutar nao
 * duplica nada.
 *
 * A persistencia fica atras de um store injetavel (mesmo desenho do drainer do
 * outbox), para ser testavel sem banco.
 */
import type { CurrencyCode, PrismaClient } from '@prisma/client';
import {
  DEFAULT_HORIZON_MONTHS,
  defaultHorizon,
  occurrenceDates,
  type RecurrenceSchedule,
} from './domain/recurrence';

/** Snapshot replicado na obrigacao a cada ocorrencia materializada. */
export interface RecurrenceTemplate {
  type: 'income' | 'expense';
  description: string;
  amount: string;
  currency?: CurrencyCode;
}

/** Regra como o processador a consome (subconjunto dos campos do schema). */
export interface RecurrenceRuleRecord {
  id: string;
  financialSpaceId: string;
  frequency: string;
  interval: number;
  startDate: Date;
  endDate: Date | null;
  occurrencesLimit: number | null;
  template: RecurrenceTemplate;
  state: string;
}

/** Linha prevista a gravar (a situacao e sempre `forecast`). */
export interface ForecastRow {
  financialSpaceId: string;
  recurrenceRuleId: string;
  status: 'forecast';
  type: string;
  description: string;
  currency: CurrencyCode;
  amount: string;
  dueDate: Date;
}

/** Abstrai a persistencia das regras/previsoes (implementado sobre o Prisma). */
export interface RecurrenceStore {
  findActiveRules(): Promise<RecurrenceRuleRecord[]>;
  findRule(id: string): Promise<RecurrenceRuleRecord | null>;
  /** Grava as previsoes ignorando as que ja existem; devolve quantas entraram. */
  createForecasts(rows: ForecastRow[]): Promise<number>;
}

/** Logger minimo aceito pelo processador (compativel com o pino do worker). */
export interface RecurrenceLogger {
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
  error(obj: Record<string, unknown>, msg: string): void;
}

export interface RecurrenceProcessorDeps {
  store: RecurrenceStore;
  logger: RecurrenceLogger;
  /** Injetavel para testes; padrao = relogio do sistema. */
  now?: () => Date;
  /** Horizonte de materializacao em meses (padrao = 12). */
  horizonMonths?: number;
}

export interface RecurrenceRunResult {
  rules: number;
  plannedCount: number;
  generatedCount: number;
}

export interface RecurrenceRuleResult {
  handled: boolean;
  ruleId?: string;
  horizon?: string;
  plannedCount: number;
  generatedCount: number;
}

export interface RecurrenceProcessor {
  /** Rematerializa todas as regras ativas ate o horizonte padrao. */
  generateAll(): Promise<RecurrenceRunResult>;
  /** Materializa uma regra especifica (job manual pelo `ruleId`). */
  generateRule(ruleId?: string, upToDate?: string): Promise<RecurrenceRuleResult>;
}

const isoDate = (date: Date): string => date.toISOString().slice(0, 10);

function scheduleOf(rule: RecurrenceRuleRecord): RecurrenceSchedule {
  return {
    frequency: rule.frequency,
    interval: rule.interval,
    startDate: rule.startDate,
    endDate: rule.endDate,
    occurrencesLimit: rule.occurrencesLimit,
  };
}

function forecastOf(rule: RecurrenceRuleRecord, dueDate: Date): ForecastRow {
  return {
    financialSpaceId: rule.financialSpaceId,
    recurrenceRuleId: rule.id,
    status: 'forecast',
    type: rule.template.type,
    description: rule.template.description,
    currency: rule.template.currency ?? 'BRL',
    amount: rule.template.amount,
    dueDate,
  };
}

/**
 * Materializa as previsoes das regras ate o horizonte. `generateAll` cobre todas
 * as ativas de uma vez (o ciclo periodico); `generateRule` atende um pedido
 * pontual e ignora regra inexistente ou arquivada.
 */
export function createRecurrenceProcessor(deps: RecurrenceProcessorDeps): RecurrenceProcessor {
  const now = deps.now ?? (() => new Date());
  const horizonMonths = deps.horizonMonths ?? DEFAULT_HORIZON_MONTHS;

  function plan(rule: RecurrenceRuleRecord, horizon: Date): ForecastRow[] {
    return occurrenceDates(scheduleOf(rule), horizon).map((dueDate) => forecastOf(rule, dueDate));
  }

  return {
    async generateAll(): Promise<RecurrenceRunResult> {
      const rules = await deps.store.findActiveRules();
      const horizon = defaultHorizon(now(), horizonMonths);
      let plannedCount = 0;
      let generatedCount = 0;

      for (const rule of rules) {
        const rows = plan(rule, horizon);
        plannedCount += rows.length;
        if (rows.length === 0) continue;
        const created = await deps.store.createForecasts(rows);
        generatedCount += created;
        if (created > 0) {
          deps.logger.info({ ruleId: rule.id, created, planned: rows.length }, 'Previsoes estendidas');
        }
      }

      deps.logger.info(
        { rules: rules.length, plannedCount, generatedCount, horizon: isoDate(horizon) },
        'Ciclo de recorrencias concluido',
      );
      return { rules: rules.length, plannedCount, generatedCount };
    },

    async generateRule(ruleId?: string, upToDate?: string): Promise<RecurrenceRuleResult> {
      if (!ruleId) {
        deps.logger.warn({}, 'Job de recorrencia sem ruleId');
        return { handled: false, plannedCount: 0, generatedCount: 0 };
      }

      const rule = await deps.store.findRule(ruleId);
      if (!rule) {
        deps.logger.warn({ ruleId }, 'Regra de recorrencia nao encontrada');
        return { handled: false, plannedCount: 0, generatedCount: 0 };
      }
      if (rule.state !== 'active') {
        deps.logger.info({ ruleId, state: rule.state }, 'Regra arquivada; nada a gerar');
        return { handled: false, plannedCount: 0, generatedCount: 0 };
      }

      const horizon = upToDate ? new Date(upToDate) : defaultHorizon(now(), horizonMonths);
      const rows = plan(rule, horizon);
      const generatedCount = rows.length > 0 ? await deps.store.createForecasts(rows) : 0;
      deps.logger.info(
        { ruleId, generatedCount, plannedCount: rows.length, horizon: isoDate(horizon) },
        'Regra de recorrencia materializada',
      );
      return {
        handled: true,
        ruleId,
        horizon: isoDate(horizon),
        plannedCount: rows.length,
        generatedCount,
      };
    },
  };
}

/** Store das recorrencias sobre o Prisma (mesmas tabelas que a API grava). */
export function createPrismaRecurrenceStore(prisma: PrismaClient): RecurrenceStore {
  const toRecord = (row: {
    id: string;
    financialSpaceId: string;
    frequency: string;
    interval: number;
    startDate: Date;
    endDate: Date | null;
    occurrencesLimit: number | null;
    template: unknown;
    state: string;
  }): RecurrenceRuleRecord => {
    const template = (row.template ?? {}) as Record<string, unknown>;
    return {
      id: row.id,
      financialSpaceId: row.financialSpaceId,
      frequency: row.frequency,
      interval: row.interval,
      startDate: row.startDate,
      endDate: row.endDate,
      occurrencesLimit: row.occurrencesLimit,
      state: row.state,
      template: {
        type: template.type === 'income' ? 'income' : 'expense',
        description: String(template.description ?? ''),
        amount: String(template.amount ?? '0'),
        currency: typeof template.currency === 'string' ? (template.currency as CurrencyCode) : undefined,
      },
    };
  };

  return {
    findActiveRules: async () =>
      (await prisma.recurrenceRule.findMany({ where: { state: 'active' } })).map(toRecord),

    findRule: async (id) => {
      const row = await prisma.recurrenceRule.findUnique({ where: { id } });
      return row ? toRecord(row) : null;
    },

    createForecasts: async (rows) => {
      if (rows.length === 0) return 0;
      const result = await prisma.obligation.createMany({ data: rows, skipDuplicates: true });
      return result.count;
    },
  };
}

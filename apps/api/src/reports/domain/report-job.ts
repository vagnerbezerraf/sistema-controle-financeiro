/**
 * Dominio puro dos relatorios assincronos (Fase 5).
 *
 * O pedido de relatorio e barato de gravar, mas caro de produzir (varredura de
 * lancamentos + montagem do arquivo). Por isso ele e processado em background:
 * a API grava o pedido como `pending` e um evento no outbox na mesma transacao;
 * o worker gera o conteudo e o deixa em cache no proprio job.
 *
 * Nada aqui toca o banco nem o relogio global: as funcoes recebem os dados e a
 * data de referencia como parametros, o que as torna deterministicamente
 * testaveis.
 */

/** Janela padrao quando o cliente nao informa o periodo (ultimos 30 dias). */
export const DEFAULT_PERIOD_DAYS = 30;

/** Teto de dias por pedido, para nao gerar uma varredura ilimitada. */
export const MAX_PERIOD_DAYS = 366;

/** Quantos jobs a listagem devolve (mais recentes primeiro). */
export const REPORT_JOB_LIST_LIMIT = 50;

/** Periodo (inclusivo) coberto pelo relatorio, em dias `YYYY-MM-DD`. */
export interface ReportPeriod {
  from: string;
  to: string;
}

/** Normaliza uma data (Date ou ISO) para o dia `YYYY-MM-DD`, em UTC. */
export function toIsoDay(value: string | Date): string {
  return (value instanceof Date ? value.toISOString() : value).slice(0, 10);
}

/** Desloca um dia `YYYY-MM-DD` em N dias (negativo volta no tempo). */
export function addDaysIso(day: string, days: number): string {
  const [year, month, dayOfMonth] = day.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, dayOfMonth + days));
  return date.toISOString().slice(0, 10);
}

/**
 * Resolve o periodo do pedido. Sem `to`, usa hoje; sem `from`, o inicio padrao
 * e `to` menos {@link DEFAULT_PERIOD_DAYS} dias. As datas informadas sao
 * preservadas como vieram (o chamador ja as validou no DTO).
 */
export function normalizePeriod(
  input: { from?: string; to?: string },
  today: string | Date = new Date(),
): ReportPeriod {
  const to = input.to ? toIsoDay(input.to) : toIsoDay(today);
  const from = input.from ? toIsoDay(input.from) : addDaysIso(to, -DEFAULT_PERIOD_DAYS);
  return { from, to };
}

/** Quantidade de dias coberta pelo periodo, contando as duas pontas. */
export function periodDays(period: ReportPeriod): number {
  const from = Date.parse(`${period.from}T00:00:00Z`);
  const to = Date.parse(`${period.to}T00:00:00Z`);
  return Math.round((to - from) / 86_400_000) + 1;
}

/** O periodo e valido quando `from` nao e posterior a `to`. */
export function isPeriodOrdered(period: ReportPeriod): boolean {
  return period.from <= period.to;
}

/** O periodo cabe no teto de dias por pedido. */
export function isPeriodWithinLimit(period: ReportPeriod): boolean {
  return periodDays(period) <= MAX_PERIOD_DAYS;
}

/** So ha o que baixar quando o job terminou com sucesso. */
export function canDownload(status: string): boolean {
  return status === 'done';
}

/** O evento de outbox que dispara a geracao do relatorio. */
export const REPORT_REQUESTED_EVENT = 'report.requested';

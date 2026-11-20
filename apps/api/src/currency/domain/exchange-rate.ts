/**
 * Dominio puro das taxas de cambio (Fase 5, multiplas moedas).
 *
 * Uma taxa converte `fromCurrency` em `toCurrency` a partir de uma data
 * (`asOf`), inclusive, ate ser substituida por outra taxa mais recente do mesmo
 * par. Quando o par direto nao existe, tentamos o par inverso usando 1/rate.
 * Nada aqui toca o banco: recebe as taxas e o alvo como dados.
 *
 * Comentarios sem acentos por convencao do projeto.
 */

/** Versao minima da taxa usada no casamento (ja lida do banco). */
export interface ExchangeRateInput {
  fromCurrency: string;
  toCurrency: string;
  /** Quantas unidades de `toCurrency` valem 1 de `fromCurrency`. */
  rate: string;
  /** Data de vigencia no formato `YYYY-MM-DD`. */
  asOf: string;
}

/** Taxa efetiva resolvida para um par e uma data. */
export interface ResolvedRate {
  /** Taxa efetiva de `from` para `to` (sempre > 0). */
  rate: number;
  /** `true` quando veio do par inverso (1/rate). */
  inverted: boolean;
  /** Data da taxa aplicada (`YYYY-MM-DD`). */
  asOf: string;
}

/** Normaliza uma data ISO para o dia (`YYYY-MM-DD`). */
export function toIsoDay(value: string): string {
  return value.slice(0, 10);
}

/** Uma taxa e valida quando e um decimal positivo com ate 4 casas. */
export function isValidRate(value: string): boolean {
  if (!/^\d+(\.\d{1,4})?$/.test(value)) return false;
  return Number(value) > 0;
}

/** Ultima taxa do par (`from` -> `to`) com vigencia ate `day` (inclusive). */
function latestOnOrBefore(
  rates: readonly ExchangeRateInput[],
  from: string,
  to: string,
  day: string,
): ExchangeRateInput | null {
  let best: ExchangeRateInput | null = null;
  for (const rate of rates) {
    if (rate.fromCurrency !== from || rate.toCurrency !== to) continue;
    const rateDay = toIsoDay(rate.asOf);
    if (rateDay > day) continue;
    if (!best || rateDay > toIsoDay(best.asOf)) best = rate;
  }
  return best;
}

/**
 * Resolve a taxa efetiva de `from` para `to` vigente em `asOf`. Mesma moeda
 * resolve como identidade (1). Tenta o par direto e, se nao houver, o inverso.
 * Devolve `null` quando nao existe taxa aplicavel.
 */
export function resolveRate(
  rates: readonly ExchangeRateInput[],
  from: string,
  to: string,
  asOf: string,
): ResolvedRate | null {
  if (from === to) return { rate: 1, inverted: false, asOf: toIsoDay(asOf) };
  const day = toIsoDay(asOf);

  const direct = latestOnOrBefore(rates, from, to, day);
  if (direct) return { rate: Number(direct.rate), inverted: false, asOf: toIsoDay(direct.asOf) };

  const inverse = latestOnOrBefore(rates, to, from, day);
  if (inverse && Number(inverse.rate) > 0) {
    return { rate: 1 / Number(inverse.rate), inverted: true, asOf: toIsoDay(inverse.asOf) };
  }
  return null;
}

/**
 * Converte centavos de `from` para `to` na data informada. Devolve `null`
 * quando nao ha taxa aplicavel (o chamador decide o que fazer com o valor).
 */
export function convertCents(
  cents: number,
  from: string,
  to: string,
  rates: readonly ExchangeRateInput[],
  asOf: string,
): number | null {
  const resolved = resolveRate(rates, from, to, asOf);
  if (!resolved) return null;
  return Math.round(cents * resolved.rate);
}

/** Converte um valor decimal (string) para a moeda de destino. */
export function convertAmount(
  amount: string,
  from: string,
  to: string,
  rates: readonly ExchangeRateInput[],
  asOf: string,
): string | null {
  const cents = convertCents(Math.round(Number(amount) * 100), from, to, rates, asOf);
  if (cents === null) return null;
  return (cents / 100).toFixed(2);
}

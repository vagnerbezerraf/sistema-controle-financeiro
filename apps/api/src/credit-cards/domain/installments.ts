/**
 * Regras da compra parcelada no cartao de credito.
 *
 * Uma compra em N parcelas vira N transacoes, uma por mes, cada uma caindo no
 * ciclo de faturamento da sua competencia. Assim a soma das parcelas coincide
 * sempre com a compra e cada parcela aparece na fatura esperada, sem precisar
 * de nenhum tratamento especial na agregacao de faturas.
 *
 * Tudo aqui e funcao pura (centavos inteiros e `Date` em UTC) para poder ser
 * testado sem banco e para eliminar deriva de ponto flutuante na divisao.
 */
import { clampToMonth, toUtcDateOnly } from './billing-cycle';

/** Limite de parcelas aceito em uma compra (o mesmo teto usado pelo DTO). */
export const MAX_INSTALLMENTS = 48;

/**
 * Divide um total em centavos por N parcelas, distribuindo as sobras de
 * arredondamento nas primeiras parcelas (convencao dos emissores).
 *
 * A soma do resultado e sempre exatamente igual ao total informado.
 */
export function splitInstallments(totalCents: number, count: number): number[] {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error('A quantidade de parcelas deve ser um inteiro positivo');
  }
  const base = Math.floor(totalCents / count);
  const remainder = totalCents - base * count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
}

/**
 * Datas das parcelas: uma por mes, mantendo o dia da compra e ajustando para o
 * ultimo dia valido quando o mes for mais curto (ex.: 31 -> 28/29).
 */
export function installmentDates(firstDate: Date, count: number): Date[] {
  const ref = toUtcDateOnly(firstDate);
  const day = ref.getUTCDate();
  return Array.from({ length: count }, (_, index) =>
    clampToMonth(ref.getUTCFullYear(), ref.getUTCMonth() + index, day),
  );
}

/** Descricao da parcela; so numera quando a compra tem mais de uma parcela. */
export function installmentDescription(description: string, number: number, count: number): string {
  return count > 1 ? `${description} (${number}/${count})` : description;
}

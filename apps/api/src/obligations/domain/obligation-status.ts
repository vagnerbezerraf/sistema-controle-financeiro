/**
 * Ciclo de vida das obrigacoes (contas a pagar/receber e previsoes).
 *
 * Duas ideias sustentam as regras:
 * - `overdue` **nao e persistido**: e derivado na leitura (vencimento passado e
 *   obrigacao ainda em aberto), para nao depender de um job que ainda nao existe.
 * - `reconciled`/`partially_reconciled` so mudam pela conciliacao com uma
 *   transacao; por isso nao aparecem nas transicoes manuais.
 */
import { toUtcDateOnly } from '../../credit-cards/domain/billing-cycle';

export const STORED_OBLIGATION_STATUSES = [
  'forecast',
  'pending',
  'partially_reconciled',
  'reconciled',
  'ignored',
  'canceled',
] as const;
export type StoredObligationStatus = (typeof STORED_OBLIGATION_STATUSES)[number];

/** Situacao derivada (nunca gravada) de obrigacao vencida e ainda em aberto. */
export const OVERDUE_STATUS = 'overdue' as const;
export type ObligationStatus = StoredObligationStatus | typeof OVERDUE_STATUS;

/** Transicoes permitidas pelo PATCH manual de status. */
const TRANSITIONS: Record<StoredObligationStatus, readonly StoredObligationStatus[]> = {
  forecast: ['pending', 'ignored', 'canceled'],
  pending: ['forecast', 'ignored', 'canceled'],
  partially_reconciled: [],
  reconciled: [],
  ignored: ['forecast', 'pending', 'canceled'],
  canceled: ['forecast', 'pending'],
};

export function isStoredObligationStatus(value: string): value is StoredObligationStatus {
  return (STORED_OBLIGATION_STATUSES as readonly string[]).includes(value);
}

export function canTransitionObligation(from: string, to: string): boolean {
  if (!isStoredObligationStatus(from) || !isStoredObligationStatus(to)) return false;
  return TRANSITIONS[from].includes(to);
}

/** Vencida = prazo passado e a obrigacao ainda em aberto (previsao ou a pagar). */
export function isObligationOverdue(
  obligation: { status: string; dueDate: Date },
  today: Date = new Date(),
): boolean {
  if (obligation.status !== 'forecast' && obligation.status !== 'pending') return false;
  return toUtcDateOnly(obligation.dueDate).getTime() < toUtcDateOnly(today).getTime();
}

/**
 * Situacao resultante da conciliacao: a transacao cobre o valor da obrigacao
 * (`reconciled`) ou apenas parte dele (`partially_reconciled`).
 *
 * A comparacao e feita em centavos para nao sofrer com a representacao binaria
 * dos valores decimais.
 */
export function reconcileStatusFor(
  obligationAmount: string | number,
  transactionAmount: string | number,
): Extract<StoredObligationStatus, 'reconciled' | 'partially_reconciled'> {
  const obligationCents = Math.round(Number(obligationAmount) * 100);
  const transactionCents = Math.round(Number(transactionAmount) * 100);
  return transactionCents >= obligationCents ? 'reconciled' : 'partially_reconciled';
}

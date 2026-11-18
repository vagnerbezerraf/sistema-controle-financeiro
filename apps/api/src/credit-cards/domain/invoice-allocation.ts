/**
 * Alocacao de pagamentos de fatura.
 *
 * As compras de um cartao sao organizadas por ciclo; os pagamentos (creditos de
 * transferencia na conta do cartao) quitam as faturas em cascata, da mais antiga
 * para a mais recente. Esse é o comportamento usual dos emissores e dispensa
 * vincular cada pagamento a uma fatura especifica, alem de manter o resultado
 * deterministico e testavel.
 *
 * Os calculos sao feitos em centavos (inteiros) para evitar deriva de ponto
 * flutuante na distribuicao.
 */

export interface InvoiceChargeLine {
  id: string;
  closingDate: Date;
  total: number;
}

/** Arredonda para duas casas decimais (centavos). */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Devolve, por fatura, quanto dos pagamentos foi aplicado a ela. */
export function allocatePaymentsFifo(
  lines: InvoiceChargeLine[],
  totalPaid: number,
): Map<string, number> {
  const ordered = [...lines].sort((a, b) => a.closingDate.getTime() - b.closingDate.getTime());
  let remainingCents = Math.max(0, Math.round(totalPaid * 100));
  const applied = new Map<string, number>();

  for (const line of ordered) {
    const totalCents = Math.max(0, Math.round(line.total * 100));
    const valueCents = Math.min(remainingCents, totalCents);
    applied.set(line.id, valueCents / 100);
    remainingCents -= valueCents;
  }

  return applied;
}

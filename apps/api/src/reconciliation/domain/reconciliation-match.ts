/**
 * Casamento entre um lancamento previsto (obrigacao) e um item importado
 * (lancamento confirmado criado por um lote de importacao).
 *
 * O dominio e **puro**: recebe as listas ja carregadas do banco e devolve as
 * sugestoes ordenadas por confianca. Nada aqui acessa banco nem grava estado,
 * o que mantem a regra testavel isoladamente e reutilizavel pela API.
 */

/** Tolerancia de valor aceita para considerar o montante "proximo". */
const AMOUNT_TOLERANCE = 0.05;

export type ReconciliationBand = 'high' | 'medium' | 'low';

/** Motivos que podem contribuir para a pontuacao de um casamento. */
export type MatchReason =
  | 'valor_igual'
  | 'valor_cobre'
  | 'valor_proximo'
  | 'mesma_data'
  | 'data_proxima'
  | 'descricao_similar';

export interface MatchObligation {
  id: string;
  type: string;
  description: string;
  amount: string | number;
  dueDate: Date;
}

export interface MatchTransaction {
  id: string;
  type: string;
  description: string;
  totalAmount: string | number;
  effectiveDate: Date;
}

export interface ScoredMatch {
  obligationId: string;
  transactionId: string;
  score: number;
  band: ReconciliationBand;
  reasons: MatchReason[];
  /** Distancia absoluta em dias entre vencimento e data efetiva (desempate). */
  dayDistance: number;
}

/** A partir desta pontuacao a conciliacao automatica pode ser aplicada sozinha. */
export const AUTO_RECONCILE_MIN_SCORE = 80;

const toCents = (value: string | number) => Math.round(Number(value) * 100);

/** Distancia em dias entre duas datas, normalizada para meia-noite UTC. */
function dayDistance(a: Date, b: Date): number {
  const left = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const right = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.abs(Math.round((left - right) / 86_400_000));
}

/** Tokens significativos da descricao (sem acentos, minusculos, ao menos 3 letras). */
function tokens(description: string): Set<string> {
  return new Set(
    description
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 3),
  );
}

/** Similaridade de Jaccard entre as descricoes (0 quando alguma nao tem tokens). */
function descriptionSimilarity(a: string, b: string): number {
  const left = tokens(a);
  const right = tokens(b);
  if (left.size === 0 || right.size === 0) return 0;
  let common = 0;
  for (const token of left) if (right.has(token)) common += 1;
  return common / (left.size + right.size - common);
}

export function bandFor(score: number): ReconciliationBand {
  if (score >= AUTO_RECONCILE_MIN_SCORE) return 'high';
  if (score >= 55) return 'medium';
  return 'low';
}

/**
 * Pontua um par previsto x importado. Devolve `null` quando nao ha casamento
 * plausivel (tipos diferentes, tipo fora de receita/despesa ou pontuacao nula),
 * o que evita sugestoes totalmente ruidosas.
 */
export function scoreMatch(
  obligation: MatchObligation,
  transaction: MatchTransaction,
): { score: number; reasons: MatchReason[]; dayDistance: number } | null {
  if (obligation.type !== transaction.type) return null;
  if (obligation.type !== 'income' && obligation.type !== 'expense') return null;

  const reasons: MatchReason[] = [];
  let score = 0;

  const obligationCents = toCents(obligation.amount);
  const transactionCents = toCents(transaction.totalAmount);
  if (transactionCents === obligationCents) {
    score += 60;
    reasons.push('valor_igual');
  } else if (transactionCents > obligationCents) {
    score += 40;
    reasons.push('valor_cobre');
  } else if (obligationCents - transactionCents <= Math.abs(obligationCents) * AMOUNT_TOLERANCE) {
    score += 20;
    reasons.push('valor_proximo');
  }

  const distance = dayDistance(obligation.dueDate, transaction.effectiveDate);
  if (distance <= 1) {
    score += 25;
    reasons.push('mesma_data');
  } else if (distance <= 3) {
    score += 15;
    reasons.push('data_proxima');
  } else if (distance <= 7) {
    score += 10;
  } else if (distance <= 15) {
    score += 5;
  }

  const similarity = descriptionSimilarity(obligation.description, transaction.description);
  if (similarity > 0) {
    score += Math.round(15 * similarity);
    if (similarity >= 0.5) reasons.push('descricao_similar');
  }

  if (score === 0) return null;
  return { score: Math.min(100, score), reasons, dayDistance: distance };
}

/**
 * Constroi as sugestoes com uma atribuicao **gulosa 1:1**: ordena os pares por
 * pontuacao (desempatando pela menor distancia de data) e so aceita um par
 * quando nenhum dos dois lados ja foi usado. Assim cada conta prevista e cada
 * item importado aparecem em, no maximo, uma sugestao.
 */
export function buildReconciliationSuggestions(
  obligations: MatchObligation[],
  transactions: MatchTransaction[],
): ScoredMatch[] {
  const candidates: ScoredMatch[] = [];
  for (const obligation of obligations) {
    for (const transaction of transactions) {
      const scored = scoreMatch(obligation, transaction);
      if (!scored) continue;
      candidates.push({
        obligationId: obligation.id,
        transactionId: transaction.id,
        score: scored.score,
        band: bandFor(scored.score),
        reasons: scored.reasons,
        dayDistance: scored.dayDistance,
      });
    }
  }

  candidates.sort(
    (a, b) =>
      b.score - a.score ||
      a.dayDistance - b.dayDistance ||
      a.obligationId.localeCompare(b.obligationId) ||
      a.transactionId.localeCompare(b.transactionId),
  );

  const usedObligations = new Set<string>();
  const usedTransactions = new Set<string>();
  const picked: ScoredMatch[] = [];
  for (const candidate of candidates) {
    if (usedObligations.has(candidate.obligationId)) continue;
    if (usedTransactions.has(candidate.transactionId)) continue;
    usedObligations.add(candidate.obligationId);
    usedTransactions.add(candidate.transactionId);
    picked.push(candidate);
  }
  return picked;
}

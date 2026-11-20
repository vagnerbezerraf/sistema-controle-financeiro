/**
 * Dominio puro das regras de categorizacao automatica (Fase 5).
 *
 * Uma regra casa a descricao de um lancamento por um padrao textual e aponta
 * para uma categoria. As regras sao avaliadas em ordem de `priority` (menor
 * primeiro) e a **primeira** que casar define a categoria: assim a precedencia
 * e determinista e nao depende da ordem de gravacao. Nada aqui toca o banco:
 * recebe as regras e o alvo como dados.
 *
 * Comentarios sem acentos por convencao do projeto.
 */

export type RuleMatchType = 'contains' | 'equals' | 'startsWith';

export type CategorizationTargetType = 'income' | 'expense';

/** Regra ja normalizada pelo chamador, pronta para o casamento. */
export interface CategorizationRuleInput {
  id: string;
  /** Menor valor = maior precedencia. */
  priority: number;
  matchType: RuleMatchType;
  pattern: string;
  categoryId: string;
  /** Filtro por tipo do lancamento; nulo casa receita e despesa. */
  type: CategorizationTargetType | null;
}

/** Alvo do casamento: a descricao do lancamento e o seu tipo. */
export interface CategorizationTarget {
  description: string;
  type: CategorizationTargetType | null;
}

/** Padrao de prioridade quando a regra nao informa um. */
export const DEFAULT_RULE_PRIORITY = 100;

/**
 * Normaliza texto para comparacao: remove acentos, baixa a caixa, apara e
 * colapsa espacos internos. Assim "Mercado  São  Paulo" casa com "mercado sao".
 */
export function normalizeForMatch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/** Verifica se o padrao da regra casa com a descricao informada. */
export function matchesRule(rule: CategorizationRuleInput, description: string): boolean {
  const pattern = normalizeForMatch(rule.pattern);
  if (!pattern) return false;
  const text = normalizeForMatch(description);
  switch (rule.matchType) {
    case 'equals':
      return text === pattern;
    case 'startsWith':
      return text.startsWith(pattern);
    default:
      return text.includes(pattern);
  }
}

/** Ordena as regras por precedencia (menor `priority` primeiro). */
export function sortByPriority<T extends { priority: number }>(rules: readonly T[]): T[] {
  return [...rules].sort((a, b) => a.priority - b.priority);
}

/**
 * Devolve o id da categoria da primeira regra que casar (por precedencia), ou
 * `null` quando nenhuma regra casa. Uma regra com filtro de tipo so casa alvos
 * do mesmo tipo; um alvo com tipo desconhecido nao satisfaz filtro de tipo.
 */
export function resolveCategoryId(
  rules: readonly CategorizationRuleInput[],
  target: CategorizationTarget,
): string | null {
  for (const rule of sortByPriority(rules)) {
    if (rule.type !== null && rule.type !== target.type) continue;
    if (matchesRule(rule, target.description)) return rule.categoryId;
  }
  return null;
}

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RULE_PRIORITY,
  matchesRule,
  normalizeForMatch,
  resolveCategoryId,
  sortByPriority,
  type CategorizationRuleInput,
} from './categorization-rule';

const regra = (over: Partial<CategorizationRuleInput> = {}): CategorizationRuleInput => ({
  id: 'r1',
  priority: DEFAULT_RULE_PRIORITY,
  matchType: 'contains',
  pattern: 'mercado',
  categoryId: 'c1',
  type: null,
  ...over,
});

describe('categorization-rule', () => {
  describe('normalizeForMatch', () => {
    it('remove acentos, baixa a caixa e colapsa espacos', () => {
      expect(normalizeForMatch('  Mercado  São  Paulo ')).toBe('mercado sao paulo');
    });
  });

  describe('matchesRule', () => {
    it('casa por "contains" ignorando acentos e caixa', () => {
      expect(matchesRule(regra(), 'MERCADO Municipal')).toBe(true);
    });

    it('casa por "startsWith" apenas no inicio', () => {
      expect(matchesRule(regra({ matchType: 'startsWith' }), 'Mercado Central')).toBe(true);
      expect(matchesRule(regra({ matchType: 'startsWith' }), 'Super Mercado')).toBe(false);
    });

    it('casa por "equals" apenas quando a descricao e identica', () => {
      expect(matchesRule(regra({ matchType: 'equals', pattern: 'Uber' }), 'uber')).toBe(true);
      expect(matchesRule(regra({ matchType: 'equals', pattern: 'Uber' }), 'Uber Trip')).toBe(false);
    });

    it('nao casa quando o padrao e vazio', () => {
      expect(matchesRule(regra({ pattern: '   ' }), 'Mercado')).toBe(false);
    });
  });

  describe('sortByPriority', () => {
    it('ordena por prioridade sem mudar o array de origem', () => {
      const rules = [regra({ id: 'b', priority: 50 }), regra({ id: 'a', priority: 10 })];
      const ordered = sortByPriority(rules);
      expect(ordered.map((r) => r.id)).toEqual(['a', 'b']);
      expect(rules.map((r) => r.id)).toEqual(['b', 'a']);
    });
  });

  describe('resolveCategoryId', () => {
    it('devolve a categoria da primeira regra que casa por precedencia', () => {
      const rules = [
        regra({ id: 'r1', priority: 100, pattern: 'uber', categoryId: 'transporte' }),
        regra({ id: 'r2', priority: 10, pattern: 'uber', categoryId: 'lazer' }),
      ];
      expect(resolveCategoryId(rules, { description: 'UBER Trip', type: 'expense' })).toBe('lazer');
    });

    it('respeita o filtro de tipo da regra', () => {
      const rules = [regra({ pattern: 'salario', categoryId: 'receitas', type: 'income' })];
      expect(resolveCategoryId(rules, { description: 'Salario', type: 'expense' })).toBeNull();
      expect(resolveCategoryId(rules, { description: 'Salario', type: 'income' })).toBe('receitas');
    });

    it('nao aplica regra com filtro de tipo a um alvo sem tipo', () => {
      const rules = [regra({ pattern: 'mercado', categoryId: 'alimentacao', type: 'expense' })];
      expect(resolveCategoryId(rules, { description: 'Mercado', type: null })).toBeNull();
    });

    it('devolve null quando nenhuma regra casa', () => {
      expect(resolveCategoryId([regra()], { description: 'Farmacia', type: 'expense' })).toBeNull();
    });

    it('ignora regras com padrao vazio mesmo com prioridade menor', () => {
      const rules = [
        regra({ id: 'vazia', priority: 1, pattern: '  ', categoryId: 'x' }),
        regra({ id: 'ok', priority: 2, pattern: 'mercado', categoryId: 'alimentacao' }),
      ];
      expect(resolveCategoryId(rules, { description: 'Mercado', type: 'expense' })).toBe(
        'alimentacao',
      );
    });
  });
});

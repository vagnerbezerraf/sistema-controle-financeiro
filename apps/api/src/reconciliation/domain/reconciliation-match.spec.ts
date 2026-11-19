import { describe, expect, it } from 'vitest';
import {
  AUTO_RECONCILE_MIN_SCORE,
  bandFor,
  buildReconciliationSuggestions,
  scoreMatch,
  type MatchObligation,
  type MatchTransaction,
} from './reconciliation-match';

const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const obrigacao = (over: Partial<MatchObligation> = {}): MatchObligation => ({
  id: 'ob-1',
  type: 'expense',
  description: 'Conta de luz',
  amount: '200.00',
  dueDate: dia('2026-06-10'),
  ...over,
});

const lancamento = (over: Partial<MatchTransaction> = {}): MatchTransaction => ({
  id: 'tr-1',
  type: 'expense',
  description: 'Conta de luz',
  totalAmount: '200.00',
  effectiveDate: dia('2026-06-10'),
  ...over,
});

describe('reconciliation-match', () => {
  describe('scoreMatch', () => {
    it('pontua alto quando valor, data e descricao coincidem', () => {
      const scored = scoreMatch(obrigacao(), lancamento());
      expect(scored).not.toBeNull();
      expect(scored!.score).toBe(100);
      expect(scored!.reasons).toEqual(
        expect.arrayContaining(['valor_igual', 'mesma_data', 'descricao_similar']),
      );
      expect(scored!.dayDistance).toBe(0);
    });

    it('reconhece o valor coberto (lancamento maior que a conta)', () => {
      const scored = scoreMatch(obrigacao(), lancamento({ totalAmount: '250.00' }));
      expect(scored!.reasons).toContain('valor_cobre');
      expect(scored!.reasons).not.toContain('valor_igual');
    });

    it('aceita valor proximo dentro da tolerancia de 5%', () => {
      const scored = scoreMatch(obrigacao({ amount: '200.00' }), lancamento({ totalAmount: '195.00' }));
      expect(scored!.reasons).toContain('valor_proximo');
    });

    it('desconta data distante e valor muito diferente', () => {
      const scored = scoreMatch(
        obrigacao({ description: 'Fatura', amount: '1000.00' }),
        lancamento({ description: 'Algo', effectiveDate: dia('2026-06-20'), totalAmount: '100.00' }),
      );
      // Sem valor proximo e sem data proxima sobra apenas a pontuacao de dia (5).
      expect(scored!.score).toBe(5);
      expect(scored!.reasons).toEqual([]);
    });

    it('ignora tipos diferentes e tipos nao financeiros', () => {
      expect(scoreMatch(obrigacao({ type: 'income' }), lancamento({ type: 'expense' }))).toBeNull();
      expect(scoreMatch(obrigacao({ type: 'transfer' }), lancamento({ type: 'transfer' }))).toBeNull();
    });

    it('devolve null quando nada casa (valor, data e descricao distantes)', () => {
      const scored = scoreMatch(
        obrigacao({ description: 'Mercado', amount: '1000.00' }),
        lancamento({ description: 'Salario', effectiveDate: dia('2026-12-01'), totalAmount: '10.00' }),
      );
      expect(scored).toBeNull();
    });

    it('marca o valor igual em centavos sem sofrer com decimais', () => {
      const scored = scoreMatch(obrigacao({ amount: '19.99' }), lancamento({ totalAmount: 19.99 }));
      expect(scored!.reasons).toContain('valor_igual');
    });
  });

  describe('bandFor', () => {
    it('classifica alta, media e baixa confianca', () => {
      expect(bandFor(AUTO_RECONCILE_MIN_SCORE)).toBe('high');
      expect(bandFor(79)).toBe('medium');
      expect(bandFor(55)).toBe('medium');
      expect(bandFor(54)).toBe('low');
    });
  });

  describe('buildReconciliationSuggestions', () => {
    it('produz sugestoes 1:1 (cada conta e cada item uma unica vez)', () => {
      const obrigacoes = [
        obrigacao({ id: 'ob-1', description: 'Conta de luz', amount: '200.00' }),
        obrigacao({ id: 'ob-2', description: 'Conta de agua', amount: '80.00' }),
      ];
      const itens = [
        lancamento({ id: 'tr-1', description: 'Conta de luz', totalAmount: '200.00' }),
        lancamento({ id: 'tr-2', description: 'Conta de agua', totalAmount: '80.00' }),
        // Terceiro item igual ao tr-1: nao pode casar de novo com ob-1.
        lancamento({ id: 'tr-3', description: 'Conta de luz', totalAmount: '200.00' }),
      ];

      const sugestoes = buildReconciliationSuggestions(obrigacoes, itens);
      expect(sugestoes).toHaveLength(2);
      expect(sugestoes.map((s) => s.obligationId)).toEqual(['ob-1', 'ob-2']);
      expect(sugestoes.map((s) => s.transactionId)).toEqual(['tr-1', 'tr-2']);
      expect(sugestoes.every((s) => s.band === 'high')).toBe(true);
    });

    it('prefere o casamento de maior pontuacao quando ha disputa', () => {
      const obrigacoes = [obrigacao({ id: 'ob-1', description: 'Internet', amount: '120.00' })];
      const itens = [
        lancamento({ id: 'fraco', description: 'Outro', totalAmount: '300.00', effectiveDate: dia('2026-06-30') }),
        lancamento({ id: 'forte', description: 'Internet', totalAmount: '120.00', effectiveDate: dia('2026-06-10') }),
      ];

      const sugestoes = buildReconciliationSuggestions(obrigacoes, itens);
      expect(sugestoes).toHaveLength(1);
      expect(sugestoes[0].transactionId).toBe('forte');
    });

    it('devolve lista vazia quando nada casa', () => {
      const sugestoes = buildReconciliationSuggestions(
        [obrigacao({ type: 'expense' })],
        [lancamento({ type: 'income' })],
      );
      expect(sugestoes).toEqual([]);
    });
  });
});

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAX_PAGES_PER_SYNC,
  MAX_SYNCED_IDS,
  directionForAmount,
  isConsentSyncable,
  mergeSyncedIds,
  postingDirectionFor,
  selectNewTransactions,
  signlessAmount,
  type ProviderTransaction,
  type SyncableConsent,
} from './open-finance-sync';

function tx(externalId: string): ProviderTransaction {
  return { externalId, postedAt: '2026-06-10', description: `Lancamento ${externalId}`, amount: '-10.00' };
}

const hoje = new Date('2026-06-15T12:00:00.000Z');

const consentimento = (over: Partial<SyncableConsent> = {}): SyncableConsent => ({
  id: 'c1',
  financialSpaceId: 's1',
  status: 'authorized',
  externalId: 'stub-1',
  expiresAt: new Date('2026-09-01T00:00:00.000Z'),
  targetAccountId: 'a1',
  ...over,
});

describe('open-finance sync (dominio do worker)', () => {
  describe('directionForAmount', () => {
    it('trata valor negativo como saida (expense)', () => {
      expect(directionForAmount('-152.30')).toBe('expense');
    });

    it('trata valor positivo como entrada (income)', () => {
      expect(directionForAmount('5200.00')).toBe('income');
    });

    it('trata zero e valor invalido como entrada', () => {
      expect(directionForAmount('0.00')).toBe('income');
      expect(directionForAmount('abc')).toBe('income');
    });
  });

  describe('postingDirectionFor', () => {
    it('debita a conta na entrada e credita na saida', () => {
      expect(postingDirectionFor('income')).toBe('debit');
      expect(postingDirectionFor('expense')).toBe('credit');
    });
  });

  describe('signlessAmount', () => {
    it('remove o sinal negativo e o positivo', () => {
      expect(signlessAmount('-152.30')).toBe('152.30');
      expect(signlessAmount('+39.90')).toBe('39.90');
    });

    it('mantem o valor sem sinal e apara espacos', () => {
      expect(signlessAmount('120.00')).toBe('120.00');
      expect(signlessAmount(' -88.00 ')).toBe('88.00');
    });
  });

  describe('selectNewTransactions', () => {
    it('descarta o que ja foi sincronizado', () => {
      const result = selectNewTransactions(['a', 'b'], [tx('a'), tx('c')]);
      expect(result.map((item) => item.externalId)).toEqual(['c']);
    });

    it('remove repeticoes dentro da propria pagina', () => {
      const result = selectNewTransactions([], [tx('a'), tx('a'), tx('b')]);
      expect(result.map((item) => item.externalId)).toEqual(['a', 'b']);
    });

    it('preserva a ordem recebida quando nada foi sincronizado', () => {
      const result = selectNewTransactions([], [tx('x'), tx('y'), tx('z')]);
      expect(result.map((item) => item.externalId)).toEqual(['x', 'y', 'z']);
    });
  });

  describe('mergeSyncedIds', () => {
    it('funde sem repetir, preservando a ordem', () => {
      expect(mergeSyncedIds(['a', 'b'], ['b', 'c'])).toEqual(['a', 'b', 'c']);
    });

    it('respeita o teto mantendo os mais recentes', () => {
      expect(mergeSyncedIds(['a', 'b', 'c'], ['d'], 3)).toEqual(['b', 'c', 'd']);
    });

    it('usa MAX_SYNCED_IDS por padrao sem cortar abaixo do teto', () => {
      const ids = Array.from({ length: 10 }, (_, index) => `id-${index}`);
      expect(mergeSyncedIds([], ids)).toHaveLength(10);
      expect(MAX_SYNCED_IDS).toBeGreaterThan(10);
    });
  });

  describe('isConsentSyncable', () => {
    it('aceita consentimento autorizado com provedor, conta e sem expirar', () => {
      expect(isConsentSyncable(consentimento(), hoje)).toBe(true);
    });

    it('aceita consentimento autorizado sem prazo de validade', () => {
      expect(isConsentSyncable(consentimento({ expiresAt: null }), hoje)).toBe(true);
    });

    it('recusa quando o status nao e authorized', () => {
      expect(isConsentSyncable(consentimento({ status: 'pending' }), hoje)).toBe(false);
      expect(isConsentSyncable(consentimento({ status: 'revoked' }), hoje)).toBe(false);
    });

    it('recusa consentimento expirado', () => {
      expect(isConsentSyncable(consentimento({ expiresAt: new Date('2026-06-15T11:59:59.000Z') }), hoje)).toBe(false);
    });

    it('recusa sem identificador no provedor ou sem conta de destino', () => {
      expect(isConsentSyncable(consentimento({ externalId: null }), hoje)).toBe(false);
      expect(isConsentSyncable(consentimento({ targetAccountId: null }), hoje)).toBe(false);
    });
  });

  describe('constantes', () => {
    it('le ate 10 paginas por consentimento por padrao', () => {
      expect(DEFAULT_MAX_PAGES_PER_SYNC).toBe(10);
    });
  });
});

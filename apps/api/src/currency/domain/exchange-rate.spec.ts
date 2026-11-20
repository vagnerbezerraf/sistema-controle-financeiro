import { describe, expect, it } from 'vitest';
import {
  convertAmount,
  convertCents,
  isValidRate,
  resolveRate,
  toIsoDay,
  type ExchangeRateInput,
} from './exchange-rate';

const taxa = (over: Partial<ExchangeRateInput> = {}): ExchangeRateInput => ({
  fromCurrency: 'USD',
  toCurrency: 'BRL',
  rate: '5.0000',
  asOf: '2026-01-01',
  ...over,
});

describe('exchange-rate', () => {
  describe('toIsoDay', () => {
    it('apara para o dia', () => {
      expect(toIsoDay('2026-03-04T12:00:00.000Z')).toBe('2026-03-04');
    });
  });

  describe('isValidRate', () => {
    it('aceita decimal positivo com ate 4 casas', () => {
      expect(isValidRate('5')).toBe(true);
      expect(isValidRate('5.4321')).toBe(true);
      expect(isValidRate('0.0375')).toBe(true);
    });

    it('recusa zero, negativo, vazio e mais de 4 casas', () => {
      expect(isValidRate('0')).toBe(false);
      expect(isValidRate('-1')).toBe(false);
      expect(isValidRate('')).toBe(false);
      expect(isValidRate('5.43211')).toBe(false);
      expect(isValidRate('abc')).toBe(false);
    });
  });

  describe('resolveRate', () => {
    it('resolve como identidade quando as moedas sao iguais', () => {
      expect(resolveRate([], 'BRL', 'BRL', '2026-05-10')).toEqual({
        rate: 1,
        inverted: false,
        asOf: '2026-05-10',
      });
    });

    it('usa a taxa direta vigente na data', () => {
      const resolved = resolveRate([taxa()], 'USD', 'BRL', '2026-02-01');
      expect(resolved?.rate).toBe(5);
      expect(resolved?.inverted).toBe(false);
    });

    it('escolhe a taxa mais recente ate a data (inclusive)', () => {
      const taxas = [
        taxa({ rate: '4.0000', asOf: '2026-01-01' }),
        taxa({ rate: '5.0000', asOf: '2026-03-01' }),
      ];
      expect(resolveRate(taxas, 'USD', 'BRL', '2026-03-01')?.rate).toBe(5);
      expect(resolveRate(taxas, 'USD', 'BRL', '2026-02-15')?.rate).toBe(4);
    });

    it('ignora taxas futuras em relacao a data alvo', () => {
      expect(resolveRate([taxa({ asOf: '2026-06-01' })], 'USD', 'BRL', '2026-05-01')).toBeNull();
    });

    it('usa o par inverso quando o direto nao existe', () => {
      const resolved = resolveRate([taxa({ rate: '4.0000' })], 'BRL', 'USD', '2026-02-01');
      expect(resolved?.inverted).toBe(true);
      expect(resolved?.rate).toBeCloseTo(0.25, 10);
    });

    it('devolve null quando nao ha taxa aplicavel', () => {
      expect(resolveRate([taxa()], 'EUR', 'BRL', '2026-02-01')).toBeNull();
    });
  });

  describe('convertCents', () => {
    it('converte e arredonda para centavos', () => {
      expect(convertCents(10_000, 'USD', 'BRL', [taxa({ rate: '5.4321' })], '2026-02-01')).toBe(54_321);
    });

    it('devolve null quando nao ha taxa', () => {
      expect(convertCents(10_000, 'EUR', 'BRL', [taxa()], '2026-02-01')).toBeNull();
    });

    it('mantem o valor quando as moedas sao iguais', () => {
      expect(convertCents(12_345, 'BRL', 'BRL', [], '2026-02-01')).toBe(12_345);
    });
  });

  describe('convertAmount', () => {
    it('converte um decimal preservando duas casas', () => {
      expect(convertAmount('100.00', 'USD', 'BRL', [taxa()], '2026-02-01')).toBe('500.00');
    });

    it('devolve null quando nao ha taxa', () => {
      expect(convertAmount('100.00', 'EUR', 'BRL', [taxa()], '2026-02-01')).toBeNull();
    });
  });
});

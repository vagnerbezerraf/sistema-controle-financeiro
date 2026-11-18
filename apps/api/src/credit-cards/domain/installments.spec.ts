import { describe, expect, it } from 'vitest';
import { installmentDates, installmentDescription, splitInstallments } from './installments';

const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const iso = (date: Date) => date.toISOString().slice(0, 10);

describe('installments', () => {
  describe('splitInstallments', () => {
    it('divide igualmente quando o total e divisivel', () => {
      expect(splitInstallments(90000, 3)).toEqual([30000, 30000, 30000]);
    });

    it('distribui a sobra nas primeiras parcelas e preserva a soma', () => {
      const parcelas = splitInstallments(100000, 3);
      expect(parcelas).toEqual([33334, 33333, 33333]);
      expect(parcelas.reduce((acc, v) => acc + v, 0)).toBe(100000);
    });

    it('preserva a soma em centavos quebrados', () => {
      const parcelas = splitInstallments(10999, 7);
      expect(parcelas.reduce((acc, v) => acc + v, 0)).toBe(10999);
      // Diferenca maxima entre parcelas nunca passa de um centavo.
      expect(Math.max(...parcelas) - Math.min(...parcelas)).toBe(1);
    });

    it('devolve uma unica parcela com o valor integral', () => {
      expect(splitInstallments(5000, 1)).toEqual([5000]);
    });

    it('recusa quantidade de parcelas invalida', () => {
      expect(() => splitInstallments(1000, 0)).toThrow();
      expect(() => splitInstallments(1000, 1.5)).toThrow();
    });
  });

  describe('installmentDates', () => {
    it('avanca um mes por parcela mantendo o dia', () => {
      expect(installmentDates(dia('2026-01-10'), 3).map(iso)).toEqual([
        '2026-01-10',
        '2026-02-10',
        '2026-03-10',
      ]);
    });

    it('ajusta o dia em meses mais curtos sem “escorregar” o mes', () => {
      expect(installmentDates(dia('2026-01-31'), 3).map(iso)).toEqual([
        '2026-01-31',
        '2026-02-28',
        '2026-03-31',
      ]);
    });

    it('atravessa a virada de ano', () => {
      expect(installmentDates(dia('2026-11-15'), 4).map(iso)).toEqual([
        '2026-11-15',
        '2026-12-15',
        '2027-01-15',
        '2027-02-15',
      ]);
    });
  });

  describe('installmentDescription', () => {
    it('numera quando ha mais de uma parcela', () => {
      expect(installmentDescription('Notebook', 1, 3)).toBe('Notebook (1/3)');
      expect(installmentDescription('Notebook', 3, 3)).toBe('Notebook (3/3)');
    });

    it('mantem a descricao original quando ha uma unica parcela', () => {
      expect(installmentDescription('Notebook', 1, 1)).toBe('Notebook');
    });
  });
});

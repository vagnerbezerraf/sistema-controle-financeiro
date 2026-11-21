import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HORIZON_MONTHS,
  MAX_OCCURRENCES_PER_GENERATION,
  defaultHorizon,
  occurrenceDates,
} from './recurrence';

const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const iso = (date: Date) => date.toISOString().slice(0, 10);

describe('recurrence (worker)', () => {
  describe('occurrenceDates', () => {
    it('avanca um mes por ocorrencia mantendo o dia', () => {
      const datas = occurrenceDates(
        { frequency: 'monthly', interval: 1, startDate: dia('2026-01-10') },
        dia('2026-06-30'),
      );
      expect(datas.map(iso)).toEqual([
        '2026-01-10',
        '2026-02-10',
        '2026-03-10',
        '2026-04-10',
        '2026-05-10',
        '2026-06-10',
      ]);
    });

    it('ajusta o dia em meses mais curtos sem escorregar o mes', () => {
      const datas = occurrenceDates(
        { frequency: 'monthly', interval: 1, startDate: dia('2026-01-31') },
        dia('2026-05-31'),
      );
      expect(datas.map(iso)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31']);
    });

    it('respeita o intervalo (a cada N periodos)', () => {
      const semanal = occurrenceDates(
        { frequency: 'weekly', interval: 2, startDate: dia('2026-03-02') },
        dia('2026-04-05'),
      );
      expect(semanal.map(iso)).toEqual(['2026-03-02', '2026-03-16', '2026-03-30']);

      const bimestral = occurrenceDates(
        { frequency: 'monthly', interval: 2, startDate: dia('2026-01-15') },
        dia('2026-07-31'),
      );
      expect(bimestral.map(iso)).toEqual(['2026-01-15', '2026-03-15', '2026-05-15', '2026-07-15']);
    });

    it('avanca por dia e por ano (ajustando 29/02)', () => {
      const diaria = occurrenceDates(
        { frequency: 'daily', interval: 3, startDate: dia('2026-01-01') },
        dia('2026-01-10'),
      );
      expect(diaria.map(iso)).toEqual(['2026-01-01', '2026-01-04', '2026-01-07', '2026-01-10']);

      const anual = occurrenceDates(
        { frequency: 'yearly', interval: 1, startDate: dia('2024-02-29') },
        dia('2027-12-31'),
      );
      expect(anual.map(iso)).toEqual(['2024-02-29', '2025-02-28', '2026-02-28', '2027-02-28']);
    });

    it('para no fim da vigencia (`endDate`) e no limite de ocorrencias', () => {
      const comFim = occurrenceDates(
        { frequency: 'monthly', interval: 1, startDate: dia('2026-01-05'), endDate: dia('2026-03-05') },
        dia('2026-12-31'),
      );
      expect(comFim.map(iso)).toEqual(['2026-01-05', '2026-02-05', '2026-03-05']);

      const comLimite = occurrenceDates(
        { frequency: 'monthly', interval: 1, startDate: dia('2026-01-05'), occurrencesLimit: 2 },
        dia('2026-12-31'),
      );
      expect(comLimite.map(iso)).toEqual(['2026-01-05', '2026-02-05']);
    });

    it('nao gera nada quando o inicio ja passou do horizonte', () => {
      const datas = occurrenceDates(
        { frequency: 'monthly', interval: 1, startDate: dia('2027-01-05') },
        dia('2026-12-31'),
      );
      expect(datas).toEqual([]);
    });

    it('trunca o resultado no teto da materializacao', () => {
      const datas = occurrenceDates(
        { frequency: 'daily', interval: 1, startDate: dia('2000-01-01') },
        dia('2026-12-31'),
        MAX_OCCURRENCES_PER_GENERATION,
      );
      expect(datas).toHaveLength(MAX_OCCURRENCES_PER_GENERATION);
      expect(iso(datas[0])).toBe('2000-01-01');
    });

    it('recusa frequencia e intervalo invalidos', () => {
      expect(() =>
        occurrenceDates({ frequency: 'hourly', interval: 1, startDate: dia('2026-01-01') }, dia('2026-12-31')),
      ).toThrow(/Frequencia/);
      expect(() =>
        occurrenceDates({ frequency: 'monthly', interval: 0, startDate: dia('2026-01-01') }, dia('2026-12-31')),
      ).toThrow(/intervalo/);
    });
  });

  describe('defaultHorizon', () => {
    it('projeta o mesmo dia N meses a frente', () => {
      expect(iso(defaultHorizon(dia('2026-03-15')))).toBe('2027-03-15');
      expect(DEFAULT_HORIZON_MONTHS).toBe(12);
    });

    it('ajusta o dia quando o mes alvo e mais curto', () => {
      expect(iso(defaultHorizon(dia('2026-01-31')))).toBe('2027-01-31');
      expect(iso(defaultHorizon(dia('2026-08-31'), 6))).toBe('2027-02-28');
    });
  });
});

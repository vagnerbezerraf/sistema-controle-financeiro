import { describe, expect, it } from 'vitest';
import {
  addDaysIso,
  canDownload,
  DEFAULT_PERIOD_DAYS,
  isPeriodOrdered,
  isPeriodWithinLimit,
  MAX_PERIOD_DAYS,
  normalizePeriod,
  periodDays,
  toIsoDay,
} from './report-job';

describe('relatorio assincrono (dominio)', () => {
  it('normaliza datas ISO para o dia', () => {
    expect(toIsoDay('2026-11-21T13:45:00.000Z')).toBe('2026-11-21');
    expect(toIsoDay(new Date('2026-01-02T23:59:59Z'))).toBe('2026-01-02');
  });

  it('desloca dias para frente e para tras', () => {
    expect(addDaysIso('2026-11-21', 10)).toBe('2026-12-01');
    expect(addDaysIso('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDaysIso('2024-02-28', 1)).toBe('2024-02-29');
  });

  it('usa hoje e a janela padrao quando o periodo nao e informado', () => {
    const period = normalizePeriod({}, '2026-11-21');
    expect(period).toEqual({ from: addDaysIso('2026-11-21', -DEFAULT_PERIOD_DAYS), to: '2026-11-21' });
  });

  it('preserva as datas informadas pelo cliente', () => {
    expect(normalizePeriod({ from: '2026-01-01', to: '2026-01-31' })).toEqual({
      from: '2026-01-01',
      to: '2026-01-31',
    });
  });

  it('completa apenas a ponta faltante do periodo', () => {
    expect(normalizePeriod({ from: '2026-05-10' }, '2026-05-20')).toEqual({
      from: '2026-05-10',
      to: '2026-05-20',
    });
    expect(normalizePeriod({ to: '2026-05-20' }, '2026-06-01')).toEqual({
      from: addDaysIso('2026-05-20', -DEFAULT_PERIOD_DAYS),
      to: '2026-05-20',
    });
  });

  it('conta os dias incluindo as duas pontas', () => {
    expect(periodDays({ from: '2026-01-01', to: '2026-01-01' })).toBe(1);
    expect(periodDays({ from: '2026-01-01', to: '2026-01-31' })).toBe(31);
  });

  it('recusa periodo invertido e periodo acima do teto', () => {
    expect(isPeriodOrdered({ from: '2026-02-01', to: '2026-01-01' })).toBe(false);
    expect(isPeriodOrdered({ from: '2026-01-01', to: '2026-01-31' })).toBe(true);
    expect(isPeriodWithinLimit({ from: '2026-01-01', to: '2026-12-31' })).toBe(true);
    expect(
      isPeriodWithinLimit({
        from: '2026-01-01',
        to: addDaysIso('2026-01-01', MAX_PERIOD_DAYS + 1),
      }),
    ).toBe(false);
  });

  it('libera o download somente quando o job terminou', () => {
    expect(canDownload('done')).toBe(true);
    expect(canDownload('pending')).toBe(false);
    expect(canDownload('running')).toBe(false);
    expect(canDownload('error')).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CHANNELS,
  NOTIFICATION_TYPES,
  clockTimeToMinutes,
  defaultChannels,
  isChannelEnabled,
  isQuietAt,
  isValidClockTime,
  isWithinQuietHours,
  mergePreferences,
  minutesOfDayInTimeZone,
  normalizeChannels,
  toPreferencesView,
  type StoredPreferences,
} from './notification-preferences';

const TZ = 'America/Sao_Paulo';

const stored = (over: Partial<StoredPreferences> = {}): StoredPreferences => ({
  channels: defaultChannels(),
  quietHours: { enabled: false, start: '22:00', end: '07:00' },
  includeAmounts: true,
  ...over,
});

describe('preferencias de notificacao - canais', () => {
  it('preenche todos os tipos com os canais padrao (e-mail e desktop ligados)', () => {
    const channels = defaultChannels();

    expect(Object.keys(channels).sort()).toEqual([...NOTIFICATION_TYPES].sort());
    for (const type of NOTIFICATION_TYPES) {
      expect(channels[type]).toEqual({ email: true, push: false, desktop: true });
    }
  });

  it('nao compartilha o mesmo objeto entre os tipos', () => {
    const channels = defaultChannels();
    channels.upcoming_due.email = false;

    expect(channels.invoice_due.email).toBe(true);
    expect(DEFAULT_CHANNELS.upcoming_due.email).toBe(true);
  });

  it('normaliza o JSON gravado, completando os padroes e ignorando lixo', () => {
    const channels = normalizeChannels({
      upcoming_due: { email: false, push: 'sim' },
      invoice_due: { desktop: false },
      tipo_desconhecido: { email: false },
      negative_balance: 'invalido',
    });

    expect(channels.upcoming_due).toEqual({ email: false, push: false, desktop: true });
    expect(channels.invoice_due).toEqual({ email: true, push: false, desktop: false });
    expect(channels.budget_threshold).toEqual({ email: true, push: false, desktop: true });
    expect(channels.negative_balance).toEqual({ email: true, push: false, desktop: true });
  });

  it('normaliza entradas vazias ou nao objetos para os padroes', () => {
    expect(normalizeChannels(null)).toEqual(defaultChannels());
    expect(normalizeChannels('x')).toEqual(defaultChannels());
  });

  it('responde se o canal esta habilitado para o tipo', () => {
    const channels = normalizeChannels({ upcoming_due: { push: true } });

    expect(isChannelEnabled(channels, 'upcoming_due', 'push')).toBe(true);
    expect(isChannelEnabled(channels, 'upcoming_due', 'email')).toBe(true);
    expect(isChannelEnabled(channels, 'negative_balance', 'push')).toBe(false);
  });
});

describe('preferencias de notificacao - horario silencioso', () => {
  it('aceita apenas HH:MM em 24 horas', () => {
    expect(isValidClockTime('00:00')).toBe(true);
    expect(isValidClockTime('23:59')).toBe(true);
    expect(isValidClockTime('24:00')).toBe(false);
    expect(isValidClockTime('7:00')).toBe(false);
    expect(isValidClockTime('22:60')).toBe(false);
    expect(isValidClockTime('2200')).toBe(false);
  });

  it('converte HH:MM em minutos e rejeita formato invalido', () => {
    expect(clockTimeToMinutes('00:00')).toBe(0);
    expect(clockTimeToMinutes('07:30')).toBe(450);
    expect(clockTimeToMinutes('23:59')).toBe(1439);
    expect(() => clockTimeToMinutes('25:00')).toThrow();
  });

  it('descobre a hora local no fuso informado', () => {
    const meioDiaUtc = new Date('2026-06-15T12:00:00Z');

    expect(minutesOfDayInTimeZone(meioDiaUtc, 'UTC')).toBe(720);
    expect(minutesOfDayInTimeZone(meioDiaUtc, TZ)).toBe(540);

    const madrugadaUtc = new Date('2026-06-15T01:00:00Z');
    expect(minutesOfDayInTimeZone(madrugadaUtc, TZ)).toBe(1320);
  });

  it('avalia uma janela diurna como [start, end)', () => {
    expect(isWithinQuietHours('09:00', '12:00', 540)).toBe(true);
    expect(isWithinQuietHours('09:00', '12:00', 719)).toBe(true);
    expect(isWithinQuietHours('09:00', '12:00', 720)).toBe(false);
    expect(isWithinQuietHours('09:00', '12:00', 539)).toBe(false);
  });

  it('avalia uma janela que cruza a meia-noite', () => {
    expect(isWithinQuietHours('22:00', '07:00', 1320)).toBe(true);
    expect(isWithinQuietHours('22:00', '07:00', 0)).toBe(true);
    expect(isWithinQuietHours('22:00', '07:00', 419)).toBe(true);
    expect(isWithinQuietHours('22:00', '07:00', 420)).toBe(false);
    expect(isWithinQuietHours('22:00', '07:00', 1319)).toBe(false);
  });

  it('nao silencia quando a janela tem tamanho zero', () => {
    expect(isWithinQuietHours('08:00', '08:00', 480)).toBe(false);
  });

  it('so silencia quando o horario silencioso esta habilitado', () => {
    const desabilitado = { enabled: false, start: '22:00', end: '07:00' };
    const habilitado = { enabled: true, start: '22:00', end: '07:00' };
    const noiteLocal = new Date('2026-06-15T02:00:00Z');

    expect(isQuietAt(desabilitado, noiteLocal, TZ)).toBe(false);
    expect(isQuietAt(habilitado, noiteLocal, TZ)).toBe(true);
  });
});

describe('preferencias de notificacao - atualizacao', () => {
  it('aplica um patch parcial preservando o restante', () => {
    const merged = mergePreferences(stored(), {
      channels: { upcoming_due: { email: false } },
      includeAmounts: false,
    });

    expect(merged.channels.upcoming_due).toEqual({ email: false, push: false, desktop: true });
    expect(merged.channels.invoice_due).toEqual({ email: true, push: false, desktop: true });
    expect(merged.includeAmounts).toBe(false);
    expect(merged.quietHours).toEqual({ enabled: false, start: '22:00', end: '07:00' });
  });

  it('atualiza apenas os campos de horario enviados', () => {
    const base = stored({ quietHours: { enabled: false, start: '22:00', end: '07:00' } });
    const merged = mergePreferences(base, { quietHours: { enabled: true, start: '23:30' } });

    expect(merged.quietHours).toEqual({ enabled: true, start: '23:30', end: '07:00' });
  });

  it('completa os padroes quando o canal gravado esta incompleto', () => {
    const base = stored({ channels: { ...defaultChannels(), invoice_due: {} as never } });
    const merged = mergePreferences(base, {});

    expect(merged.channels.invoice_due).toEqual({ email: true, push: false, desktop: true });
  });

  it('monta a visao com o fuso e o instante de atualizacao', () => {
    const view = toPreferencesView(stored(), TZ, new Date('2026-06-15T12:00:00Z'));

    expect(view.timezone).toBe(TZ);
    expect(view.updatedAt).toBe('2026-06-15T12:00:00.000Z');
    expect(view.channels.upcoming_due).toEqual({ email: true, push: false, desktop: true });
  });
});

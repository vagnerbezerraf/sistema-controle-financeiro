import type {
  NotificationChannel,
  NotificationChannelSettings,
  NotificationPreferences,
  NotificationType,
  QuietHours,
  UpdateNotificationPreferencesRequest,
} from '@scf/api-contracts';

/** Tipos de notificacao do MVP, na ordem exibida na interface. */
export const NOTIFICATION_TYPES: readonly NotificationType[] = [
  'upcoming_due',
  'invoice_due',
  'budget_threshold',
  'negative_balance',
];

/** Canais suportados. */
export const NOTIFICATION_CHANNELS: readonly NotificationChannel[] = ['email', 'push', 'desktop'];

/**
 * Padrao de canais por tipo: e-mail e desktop ligados; push desligado, pois
 * depende de um dispositivo registrado.
 */
export const DEFAULT_CHANNELS: Record<NotificationType, NotificationChannelSettings> = {
  upcoming_due: { email: true, push: false, desktop: true },
  invoice_due: { email: true, push: false, desktop: true },
  budget_threshold: { email: true, push: false, desktop: true },
  negative_balance: { email: true, push: false, desktop: true },
};

export const DEFAULT_QUIET_HOURS: QuietHours = { enabled: false, start: '22:00', end: '07:00' };

/** Privacidade: por padrao as notificacoes exibem valores. */
export const DEFAULT_INCLUDE_AMOUNTS = true;

/** Canais do usuario sem os metadados de persistencia (o que fica gravado). */
export interface StoredPreferences {
  channels: Record<NotificationType, NotificationChannelSettings>;
  quietHours: QuietHours;
  includeAmounts: boolean;
}

const CLOCK_TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Copia profunda dos canais padrao (evita mutar o objeto compartilhado). */
export function defaultChannels(): Record<NotificationType, NotificationChannelSettings> {
  const result = {} as Record<NotificationType, NotificationChannelSettings>;
  for (const type of NOTIFICATION_TYPES) result[type] = { ...DEFAULT_CHANNELS[type] };
  return result;
}

/**
 * Matriz de canais completa a partir do JSON gravado: mantem apenas booleanos
 * conhecidos e completa o que faltar com os padroes (tolerante a dados antigos).
 */
export function normalizeChannels(raw: unknown): Record<NotificationType, NotificationChannelSettings> {
  const source = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const result = defaultChannels();
  for (const type of NOTIFICATION_TYPES) {
    const entry = source[type];
    if (typeof entry !== 'object' || entry === null) continue;
    for (const channel of NOTIFICATION_CHANNELS) {
      const value = (entry as Record<string, unknown>)[channel];
      if (typeof value === 'boolean') result[type][channel] = value;
    }
  }
  return result;
}

/** Aceita apenas `HH:MM` em 24 horas (00:00 a 23:59). */
export function isValidClockTime(value: string): boolean {
  return CLOCK_TIME.test(value);
}

/** Minutos desde a meia-noite; lanca quando o formato e invalido. */
export function clockTimeToMinutes(value: string): number {
  const match = CLOCK_TIME.exec(value);
  if (!match) throw new Error(`Horario invalido: ${value}`);
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Minutos desde a meia-noite no fuso informado. */
export function minutesOfDayInTimeZone(at: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(at);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  // Alguns ambientes devolvem "24" para a meia-noite com `hour12: false`.
  return (hour % 24) * 60 + minute;
}

/**
 * A janela silenciosa e `[start, end)`. Quando `start >= end` ela cruza a
 * meia-noite (ex.: 22:00 -> 07:00). Uma janela de tamanho zero nunca silencia.
 */
export function isWithinQuietHours(start: string, end: string, minutes: number): boolean {
  const from = clockTimeToMinutes(start);
  const to = clockTimeToMinutes(end);
  if (from === to) return false;
  if (from < to) return minutes >= from && minutes < to;
  return minutes >= from || minutes < to;
}

/** true quando o instante cai no horario silencioso configurado. */
export function isQuietAt(quietHours: QuietHours, at: Date, timezone: string): boolean {
  if (!quietHours.enabled) return false;
  return isWithinQuietHours(quietHours.start, quietHours.end, minutesOfDayInTimeZone(at, timezone));
}

/** true quando o canal esta habilitado para o tipo de notificacao. */
export function isChannelEnabled(
  channels: Record<NotificationType, NotificationChannelSettings>,
  type: NotificationType,
  channel: NotificationChannel,
): boolean {
  return channels[type][channel];
}

/**
 * Combina o que ja esta gravado com um patch parcial, preenchendo os padroes no
 * que faltar. Nao valida formato de horario: o DTO garante `HH:MM`.
 */
export function mergePreferences(
  current: StoredPreferences,
  update: UpdateNotificationPreferencesRequest,
): StoredPreferences {
  const channels = defaultChannels();
  for (const type of NOTIFICATION_TYPES) {
    // Parte dos padroes e sobrepoe o que estiver gravado (tolerante a dados incompletos).
    channels[type] = { ...DEFAULT_CHANNELS[type], ...(current.channels[type] ?? {}) };
    const patch = update.channels?.[type];
    if (!patch) continue;
    for (const channel of NOTIFICATION_CHANNELS) {
      const value = patch[channel];
      if (typeof value === 'boolean') channels[type][channel] = value;
    }
  }

  const quietHours: QuietHours = {
    enabled: update.quietHours?.enabled ?? current.quietHours.enabled,
    start: update.quietHours?.start ?? current.quietHours.start,
    end: update.quietHours?.end ?? current.quietHours.end,
  };

  return {
    channels,
    quietHours,
    includeAmounts: update.includeAmounts ?? current.includeAmounts,
  };
}

/** Monta a visao devolvida pela API a partir do que esta gravado. */
export function toPreferencesView(
  stored: StoredPreferences,
  timezone: string,
  updatedAt: Date,
): NotificationPreferences {
  return {
    channels: stored.channels,
    quietHours: stored.quietHours,
    includeAmounts: stored.includeAmounts,
    timezone,
    updatedAt: updatedAt.toISOString(),
  };
}

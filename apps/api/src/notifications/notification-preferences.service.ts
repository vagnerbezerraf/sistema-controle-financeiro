import { Injectable, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  PrismaClient,
  type NotificationPreference as NotificationPreferenceRow,
} from '@prisma/client';
import type {
  NotificationPreferences,
  UpdateNotificationPreferencesRequest,
} from '@scf/api-contracts';
import {
  DEFAULT_INCLUDE_AMOUNTS,
  DEFAULT_QUIET_HOURS,
  defaultChannels,
  mergePreferences,
  normalizeChannels,
  toPreferencesView,
  type StoredPreferences,
} from './domain/notification-preferences';

/**
 * Preferencias de privacidade e notificacao do usuario. Sao por usuario (nao por
 * espaco); a linha e criada com os padroes na primeira leitura.
 */
@Injectable()
export class NotificationPreferencesService {
  constructor(private readonly prisma: PrismaClient) {}

  async get(userId: string): Promise<NotificationPreferences> {
    const { row, timezone } = await this.ensure(userId);
    return toPreferencesView(fromRow(row), timezone, row.updatedAt);
  }

  async update(
    userId: string,
    input: UpdateNotificationPreferencesRequest,
  ): Promise<NotificationPreferences> {
    const { row, timezone } = await this.ensure(userId);
    const merged = mergePreferences(fromRow(row), input);

    const saved = await this.prisma.notificationPreference.update({
      where: { userId },
      data: {
        channels: merged.channels as unknown as Prisma.InputJsonValue,
        quietHoursEnabled: merged.quietHours.enabled,
        quietHoursStart: merged.quietHours.start,
        quietHoursEnd: merged.quietHours.end,
        includeAmounts: merged.includeAmounts,
      },
    });

    return toPreferencesView(fromRow(saved), timezone, saved.updatedAt);
  }

  /** Linha do usuario (criada com os padroes quando ainda nao existe) e o fuso. */
  private async ensure(
    userId: string,
  ): Promise<{ row: NotificationPreferenceRow; timezone: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true },
    });
    if (!user) throw new NotFoundException('Usuario nao encontrado');

    const row = await this.prisma.notificationPreference.upsert({
      where: { userId },
      update: {},
      create: {
        userId,
        channels: defaultChannels() as unknown as Prisma.InputJsonValue,
        quietHoursEnabled: DEFAULT_QUIET_HOURS.enabled,
        quietHoursStart: DEFAULT_QUIET_HOURS.start,
        quietHoursEnd: DEFAULT_QUIET_HOURS.end,
        includeAmounts: DEFAULT_INCLUDE_AMOUNTS,
      },
    });
    return { row, timezone: user.timezone };
  }
}

function fromRow(row: NotificationPreferenceRow): StoredPreferences {
  return {
    channels: normalizeChannels(row.channels),
    quietHours: {
      enabled: row.quietHoursEnabled,
      start: row.quietHoursStart,
      end: row.quietHoursEnd,
    },
    includeAmounts: row.includeAmounts,
  };
}

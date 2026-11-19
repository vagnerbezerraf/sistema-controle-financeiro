import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsOptional, Matches, ValidateNested } from 'class-validator';

const CLOCK_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export class NotificationChannelSettingsDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  email?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  push?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  desktop?: boolean;
}

export class NotificationChannelsDto {
  @ApiProperty({ required: false, type: () => NotificationChannelSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationChannelSettingsDto)
  upcoming_due?: NotificationChannelSettingsDto;

  @ApiProperty({ required: false, type: () => NotificationChannelSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationChannelSettingsDto)
  invoice_due?: NotificationChannelSettingsDto;

  @ApiProperty({ required: false, type: () => NotificationChannelSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationChannelSettingsDto)
  budget_threshold?: NotificationChannelSettingsDto;

  @ApiProperty({ required: false, type: () => NotificationChannelSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationChannelSettingsDto)
  negative_balance?: NotificationChannelSettingsDto;
}

export class QuietHoursDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiProperty({ required: false, example: '22:00' })
  @IsOptional()
  @Matches(CLOCK_TIME, { message: 'Horario deve estar no formato HH:MM' })
  start?: string;

  @ApiProperty({ required: false, example: '07:00' })
  @IsOptional()
  @Matches(CLOCK_TIME, { message: 'Horario deve estar no formato HH:MM' })
  end?: string;
}

export class UpdateNotificationPreferencesRequestDto {
  @ApiProperty({ required: false, type: () => NotificationChannelsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationChannelsDto)
  channels?: NotificationChannelsDto;

  @ApiProperty({ required: false, type: () => QuietHoursDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => QuietHoursDto)
  quietHours?: QuietHoursDto;

  @ApiProperty({ required: false, description: 'Privacidade: exibir valores nas notificacoes' })
  @IsOptional()
  @IsBoolean()
  includeAmounts?: boolean;
}

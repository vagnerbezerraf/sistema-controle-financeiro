import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  JwtAuthGuard,
  type AuthenticatedUser,
} from '../common/auth/auth.guard';
import { UpdateNotificationPreferencesRequestDto } from './http/dto';
import { NotificationPreferencesService } from './notification-preferences.service';

@ApiTags('notification-preferences')
@Controller('notification-preferences')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
export class NotificationPreferencesController {
  constructor(private readonly preferences: NotificationPreferencesService) {}

  @Get()
  @ApiOperation({ summary: 'Preferencias de privacidade e notificacao do usuario' })
  get(@CurrentUser() user: AuthenticatedUser) {
    return this.preferences.get(user.sub);
  }

  @Patch()
  @ApiOperation({ summary: 'Atualizar as preferencias de privacidade e notificacao' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: UpdateNotificationPreferencesRequestDto,
  ) {
    return this.preferences.update(user.sub, body);
  }
}

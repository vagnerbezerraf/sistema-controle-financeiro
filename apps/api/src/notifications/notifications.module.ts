import { Module } from '@nestjs/common';
import { AuthCommonModule } from '../common/auth/auth.module';
import { NotificationPreferencesController } from './notification-preferences.controller';
import { NotificationPreferencesService } from './notification-preferences.service';

@Module({
  imports: [AuthCommonModule],
  controllers: [NotificationPreferencesController],
  providers: [NotificationPreferencesService],
})
export class NotificationsModule {}

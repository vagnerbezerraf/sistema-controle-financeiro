import { Module } from '@nestjs/common';
import { AuthCommonModule } from '../common/auth/auth.module';
import { OutboxModule } from '../outbox/outbox.module';
import { AlertsController } from './alerts.controller';
import { BalanceProjectionService } from './balance-projection.service';
import { CalendarController } from './calendar.controller';
import { ObligationsController } from './obligations.controller';
import { PendingEntriesService } from './pending-entries.service';
import { ProjectionController } from './projection.controller';
import { RecurrencesController } from './recurrences.controller';

@Module({
  imports: [AuthCommonModule, OutboxModule],
  controllers: [
    RecurrencesController,
    ObligationsController,
    CalendarController,
    AlertsController,
    ProjectionController,
  ],
  providers: [PendingEntriesService, BalanceProjectionService],
  exports: [BalanceProjectionService],
})
export class ObligationsModule {}

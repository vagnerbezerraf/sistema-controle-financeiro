import { Module } from '@nestjs/common';
import { AuthCommonModule } from '../common/auth/auth.module';
import { OutboxModule } from '../outbox/outbox.module';
import { ReconciliationController } from './reconciliation.controller';
import { ReconciliationService } from './reconciliation.service';

@Module({
  imports: [AuthCommonModule, OutboxModule],
  controllers: [ReconciliationController],
  providers: [ReconciliationService],
})
export class ReconciliationModule {}

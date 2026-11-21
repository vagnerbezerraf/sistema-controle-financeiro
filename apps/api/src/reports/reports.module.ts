import { Module } from '@nestjs/common';
import { AuthCommonModule } from '../common/auth/auth.module';
import { OutboxModule } from '../outbox/outbox.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [AuthCommonModule, OutboxModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}

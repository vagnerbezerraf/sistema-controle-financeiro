import { Module } from '@nestjs/common';
import { AuthCommonModule } from '../common/auth/auth.module';
import { AdvancedReportController } from './advanced-report.controller';
import { AdvancedReportService } from './advanced-report.service';

@Module({
  imports: [AuthCommonModule],
  controllers: [AdvancedReportController],
  providers: [AdvancedReportService],
})
export class AdvancedReportsModule {}

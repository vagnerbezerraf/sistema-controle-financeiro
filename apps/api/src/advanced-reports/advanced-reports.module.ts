import { Module } from '@nestjs/common';
import { AuthCommonModule } from '../common/auth/auth.module';
import { AdvancedReportController } from './advanced-report.controller';
import { AdvancedReportService } from './advanced-report.service';
import { CurrencyModule } from '../currency/currency.module';

@Module({
  imports: [AuthCommonModule, CurrencyModule],
  controllers: [AdvancedReportController],
  providers: [AdvancedReportService],
})
export class AdvancedReportsModule {}

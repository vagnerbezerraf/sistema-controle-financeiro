import { Module } from '@nestjs/common';
import { AuthCommonModule } from '../common/auth/auth.module';
import { MonthlyComparisonController } from './monthly-comparison.controller';
import { MonthlyComparisonService } from './monthly-comparison.service';

@Module({
  imports: [AuthCommonModule],
  controllers: [MonthlyComparisonController],
  providers: [MonthlyComparisonService],
})
export class MonthlyComparisonModule {}

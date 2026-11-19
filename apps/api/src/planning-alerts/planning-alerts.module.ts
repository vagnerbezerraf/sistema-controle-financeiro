import { Module } from '@nestjs/common';
import { AuthCommonModule } from '../common/auth/auth.module';
import { BudgetsModule } from '../budgets/budgets.module';
import { ObligationsModule } from '../obligations/obligations.module';
import { PlanningAlertsController } from './planning-alerts.controller';

@Module({
  imports: [AuthCommonModule, ObligationsModule, BudgetsModule],
  controllers: [PlanningAlertsController],
})
export class PlanningAlertsModule {}

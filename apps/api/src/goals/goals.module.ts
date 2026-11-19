import { Module } from '@nestjs/common';
import { AuthCommonModule } from '../common/auth/auth.module';
import { GoalsController } from './goals.controller';

@Module({
  imports: [AuthCommonModule],
  controllers: [GoalsController],
})
export class GoalsModule {}

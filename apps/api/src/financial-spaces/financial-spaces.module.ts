import { Module } from '@nestjs/common';
import { FinancialSpacesController } from './financial-spaces.controller';
import { AuthCommonModule } from '../common/auth/auth.module';

@Module({
  imports: [AuthCommonModule],
  controllers: [FinancialSpacesController],
})
export class SpacesModule {}

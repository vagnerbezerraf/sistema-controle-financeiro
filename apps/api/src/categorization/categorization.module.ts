import { Module } from '@nestjs/common';
import { AuthCommonModule } from '../common/auth/auth.module';
import { CategorizationController } from './categorization.controller';
import { CategorizationService } from './categorization.service';

@Module({
  imports: [AuthCommonModule],
  controllers: [CategorizationController],
  providers: [CategorizationService],
  exports: [CategorizationService],
})
export class CategorizationModule {}

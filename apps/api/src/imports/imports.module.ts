import { Module } from '@nestjs/common';
import { AuthCommonModule } from '../common/auth/auth.module';
import { CategorizationModule } from '../categorization/categorization.module';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';

@Module({
  imports: [AuthCommonModule, CategorizationModule],
  controllers: [ImportsController],
  providers: [ImportsService],
  exports: [ImportsService],
})
export class ImportsModule {}

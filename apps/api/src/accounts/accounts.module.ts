import { Module } from '@nestjs/common';
import { AccountsController } from './accounts.controller';
import { AuthCommonModule } from '../common/auth/auth.module';

@Module({
  imports: [AuthCommonModule],
  controllers: [AccountsController],
})
export class AccountsModule {}

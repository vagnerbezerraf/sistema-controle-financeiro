import { Module } from '@nestjs/common';
import { TransactionsController } from './transactions.controller';
import { AuthCommonModule } from '../common/auth/auth.module';

@Module({
  imports: [AuthCommonModule],
  controllers: [TransactionsController],
})
export class TransactionsModule {}

import { Module } from '@nestjs/common';
import { TransactionsController } from './transactions.controller';
import { AuthCommonModule } from '../common/auth/auth.module';
import { CurrencyModule } from '../currency/currency.module';

@Module({
  imports: [AuthCommonModule, CurrencyModule],
  controllers: [TransactionsController],
})
export class TransactionsModule {}

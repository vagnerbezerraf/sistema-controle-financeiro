import { Module } from '@nestjs/common';
import { CreditCardsController } from './credit-cards.controller';
import { AuthCommonModule } from '../common/auth/auth.module';
import { OutboxModule } from '../outbox/outbox.module';

@Module({
  imports: [AuthCommonModule, OutboxModule],
  controllers: [CreditCardsController],
})
export class CreditCardsModule {}

import { Module } from '@nestjs/common';
import { CreditCardsController } from './credit-cards.controller';
import { AuthCommonModule } from '../common/auth/auth.module';

@Module({
  imports: [AuthCommonModule],
  controllers: [CreditCardsController],
})
export class CreditCardsModule {}

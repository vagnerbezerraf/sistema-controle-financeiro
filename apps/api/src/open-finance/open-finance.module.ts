import { Module } from '@nestjs/common';
import { AuthCommonModule } from '../common/auth/auth.module';
import { OpenFinanceController } from './open-finance.controller';
import { OpenFinanceService } from './open-finance.service';
import { OPEN_FINANCE_PROVIDER, StubOpenFinanceProvider } from './open-finance.provider';

@Module({
  imports: [AuthCommonModule],
  controllers: [OpenFinanceController],
  providers: [
    OpenFinanceService,
    // Sem integracao com um agregador real ainda: o adaptador de
    // desenvolvimento cumpre o contrato `OpenFinanceProvider` sem rede.
    { provide: OPEN_FINANCE_PROVIDER, useClass: StubOpenFinanceProvider },
  ],
  exports: [OpenFinanceService],
})
export class OpenFinanceModule {}

import { Module } from '@nestjs/common';
import { AuthCommonModule } from '../common/auth/auth.module';
import { ObligationsModule } from '../obligations/obligations.module';
import { ScenarioController } from './scenario.controller';
import { ScenarioService } from './scenario.service';

@Module({
  imports: [AuthCommonModule, ObligationsModule],
  controllers: [ScenarioController],
  providers: [ScenarioService],
})
export class ScenariosModule {}

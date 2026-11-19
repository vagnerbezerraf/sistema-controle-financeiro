import { Injectable } from '@nestjs/common';
import { BalanceProjectionService } from '../obligations/balance-projection.service';
import { DEFAULT_PROJECTION_HORIZON_DAYS } from '../obligations/domain/projection';
import { buildScenario, type ScenarioAdjustmentInput, type ScenarioView } from './domain/scenario';

/**
 * Monta um cenario simples: le os insumos da projecao (saldo realizado +
 * compromissos em aberto) e aplica os movimentos hipoteticos informados. Nada e
 * gravado — o resultado e apenas uma leitura para o usuario decidir.
 */
@Injectable()
export class ScenarioService {
  constructor(private readonly projection: BalanceProjectionService) {}

  async simulate(
    spaceId: string,
    options: { horizonDays?: number; adjustments: ScenarioAdjustmentInput[] },
  ): Promise<ScenarioView> {
    const horizonDays = options.horizonDays ?? DEFAULT_PROJECTION_HORIZON_DAYS;
    const inputs = await this.projection.load(spaceId, { horizonDays });

    return buildScenario(inputs.entries, {
      openingBalance: inputs.openingBalance,
      adjustments: options.adjustments,
      horizonDays,
    });
  }
}

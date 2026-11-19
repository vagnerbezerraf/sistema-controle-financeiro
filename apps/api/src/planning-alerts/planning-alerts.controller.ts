import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard, Roles, SpaceRoleGuard } from '../common/auth/auth.guard';
import { BudgetsService } from '../budgets/budgets.service';
import { currentMonthRange } from '../budgets/domain/budget';
import { BalanceProjectionService } from '../obligations/balance-projection.service';
import { DEFAULT_PROJECTION_HORIZON_DAYS } from '../obligations/domain/projection';
import { ProjectionQuery } from '../obligations/http/dto';
import { buildPlanningAlerts } from './domain/planning-alerts';

@ApiTags('planning-alerts')
@Controller('financial-spaces/:spaceId/summary/planning-alerts')
@UseGuards(JwtAuthGuard, SpaceRoleGuard)
@ApiBearerAuth('access-token')
export class PlanningAlertsController {
  constructor(
    private readonly budgets: BudgetsService,
    private readonly projection: BalanceProjectionService,
  ) {}

  @Get()
  @Roles(['owner', 'admin', 'contributor', 'viewer'])
  @ApiOperation({
    summary: 'Alertas de planejamento: orcamentos em atencao/estourados e saldo projetado negativo',
  })
  async view(@Param('spaceId') spaceId: string, @Query() query: ProjectionQuery) {
    const horizonDays = query.horizonDays ?? DEFAULT_PROJECTION_HORIZON_DAYS;
    const month = currentMonthRange();

    const [budgetsView, projection] = await Promise.all([
      this.budgets.read(spaceId, month),
      this.projection.build(spaceId, { horizonDays }),
    ]);

    return buildPlanningAlerts({
      budgets: budgetsView.items,
      projection,
      horizonDays,
    });
  }
}

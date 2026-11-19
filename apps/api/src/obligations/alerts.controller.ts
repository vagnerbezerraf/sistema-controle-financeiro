import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard, Roles, SpaceRoleGuard } from '../common/auth/auth.guard';
import { buildAlerts, DEFAULT_ALERT_HORIZON_DAYS } from './domain/alerts';
import { AlertsQuery } from './http/dto';
import { PendingEntriesService } from './pending-entries.service';

/** Fim (inclusive) da janela de alertas: hoje + horizonte, em UTC. */
function horizonEnd(horizonDays: number, now: Date = new Date()): string {
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + horizonDays),
  );
  return end.toISOString().slice(0, 10);
}

@ApiTags('alerts')
@Controller('financial-spaces/:spaceId/alerts')
@UseGuards(JwtAuthGuard, SpaceRoleGuard)
@ApiBearerAuth('access-token')
export class AlertsController {
  constructor(private readonly pendingEntries: PendingEntriesService) {}

  @Get()
  @Roles(['owner', 'admin', 'contributor', 'viewer'])
  @ApiOperation({ summary: 'Alertas de vencimento: contas e faturas vencidas ou proximas' })
  async view(@Param('spaceId') spaceId: string, @Query() query: AlertsQuery) {
    const horizonDays = query.horizonDays ?? DEFAULT_ALERT_HORIZON_DAYS;
    const entries = await this.pendingEntries.listPending(spaceId, { to: horizonEnd(horizonDays) });
    return buildAlerts(entries, { horizonDays });
  }
}

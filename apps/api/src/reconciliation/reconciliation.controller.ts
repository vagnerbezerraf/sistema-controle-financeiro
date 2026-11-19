import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  JwtAuthGuard,
  Roles,
  SpaceRoleGuard,
  type AuthenticatedUser,
} from '../common/auth/auth.guard';
import { ReconciliationService } from './reconciliation.service';
import { ApplyReconciliationRequest, AutoReconcileRequest, ReconciliationQuery } from './http/dto';

@ApiTags('reconciliation')
@Controller('financial-spaces/:spaceId/reconciliation')
@UseGuards(JwtAuthGuard, SpaceRoleGuard)
@ApiBearerAuth('access-token')
export class ReconciliationController {
  constructor(private readonly reconciliation: ReconciliationService) {}

  @Get()
  @Roles(['owner', 'admin', 'contributor', 'viewer'])
  @ApiOperation({ summary: 'Sugestoes de conciliacao entre contas previstas e itens importados' })
  async view(@Param('spaceId') spaceId: string, @Query() query: ReconciliationQuery) {
    return this.reconciliation.view(spaceId, query.batchId);
  }

  @Post('apply')
  @Roles(['owner', 'admin', 'contributor'])
  @ApiOperation({ summary: 'Conciliar manualmente pares de conta prevista e item importado' })
  async apply(
    @Param('spaceId') spaceId: string,
    @Body() body: ApplyReconciliationRequest,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reconciliation.apply(spaceId, user.sub, body.matches);
  }

  @Post('auto')
  @Roles(['owner', 'admin', 'contributor'])
  @ApiOperation({ summary: 'Conciliacao automatica dos pares com alta confianca' })
  async auto(
    @Param('spaceId') spaceId: string,
    @Body() body: AutoReconcileRequest,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reconciliation.auto(spaceId, user.sub, body.batchId);
  }
}

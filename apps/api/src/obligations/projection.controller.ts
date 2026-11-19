import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard, Roles, SpaceRoleGuard } from '../common/auth/auth.guard';
import { DEFAULT_PROJECTION_HORIZON_DAYS } from './domain/projection';
import { ProjectionQuery } from './http/dto';
import { BalanceProjectionService } from './balance-projection.service';

@ApiTags('projection')
@Controller('financial-spaces/:spaceId/summary/projection')
@UseGuards(JwtAuthGuard, SpaceRoleGuard)
@ApiBearerAuth('access-token')
export class ProjectionController {
  constructor(private readonly projection: BalanceProjectionService) {}

  @Get()
  @Roles(['owner', 'admin', 'contributor', 'viewer'])
  @ApiOperation({ summary: 'Saldo projetado: caminha o saldo realizado pelos compromissos em aberto' })
  async view(@Param('spaceId') spaceId: string, @Query() query: ProjectionQuery) {
    const horizonDays = query.horizonDays ?? DEFAULT_PROJECTION_HORIZON_DAYS;
    return this.projection.build(spaceId, { horizonDays });
  }
}

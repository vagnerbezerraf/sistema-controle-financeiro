import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard, Roles, SpaceRoleGuard } from '../common/auth/auth.guard';
import { CreateScenarioRequest } from './http/dto';
import { ScenarioService } from './scenario.service';

@ApiTags('scenarios')
@Controller('financial-spaces/:spaceId/summary/scenario')
@UseGuards(JwtAuthGuard, SpaceRoleGuard)
@ApiBearerAuth('access-token')
export class ScenarioController {
  constructor(private readonly scenarios: ScenarioService) {}

  @Post()
  @Roles(['owner', 'admin', 'contributor', 'viewer'])
  @ApiOperation({
    summary: 'Cenario simples: simula movimentos hipoteticos sobre o saldo projetado (sem gravar)',
  })
  async simulate(@Param('spaceId') spaceId: string, @Body() body: CreateScenarioRequest) {
    return this.scenarios.simulate(spaceId, {
      horizonDays: body.horizonDays,
      adjustments: body.adjustments,
    });
  }
}

import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  JwtAuthGuard,
  Roles,
  SpaceRoleGuard,
  type AuthenticatedUser,
} from '../common/auth/auth.guard';
import { CategorizationService } from './categorization.service';
import {
  ApplyCategorizationQuery,
  CreateCategorizationRuleRequest,
  ListCategorizationRulesQuery,
  UpdateCategorizationRuleRequest,
} from './http/dto';

@ApiTags('categorization-rules')
@Controller('financial-spaces/:spaceId/categorization-rules')
@UseGuards(JwtAuthGuard, SpaceRoleGuard)
@ApiBearerAuth('access-token')
export class CategorizationController {
  constructor(private readonly categorization: CategorizationService) {}

  @Get()
  @Roles(['owner', 'admin', 'contributor', 'viewer'])
  @ApiOperation({ summary: 'Listar regras de categorizacao (por precedencia)' })
  async list(
    @Param('spaceId') spaceId: string,
    @Query() query: ListCategorizationRulesQuery,
  ) {
    return this.categorization.list(spaceId, query.state);
  }

  @Post()
  @Roles(['owner', 'admin', 'contributor'])
  @ApiOperation({ summary: 'Criar regra de categorizacao automatica' })
  async create(
    @Param('spaceId') spaceId: string,
    @Body() body: CreateCategorizationRuleRequest,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.categorization.create(spaceId, body, user.sub);
  }

  @Post('apply')
  @Roles(['owner', 'admin', 'contributor'])
  @ApiOperation({ summary: 'Aplicar as regras retroativamente aos lancamentos sem categoria' })
  async apply(
    @Param('spaceId') spaceId: string,
    @Query() query: ApplyCategorizationQuery,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.categorization.apply(spaceId, { from: query.from, to: query.to }, user.sub);
  }

  @Patch(':ruleId')
  @Roles(['owner', 'admin', 'contributor'])
  @ApiOperation({ summary: 'Atualizar regra (concorrencia otimista via `version`)' })
  async update(
    @Param('spaceId') spaceId: string,
    @Param('ruleId') ruleId: string,
    @Body() body: UpdateCategorizationRuleRequest,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.categorization.update(spaceId, ruleId, body, user.sub);
  }

  @Delete(':ruleId')
  @Roles(['owner', 'admin', 'contributor'])
  @ApiOperation({ summary: 'Remover regra de categorizacao' })
  async remove(
    @Param('spaceId') spaceId: string,
    @Param('ruleId') ruleId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.categorization.remove(spaceId, ruleId, user.sub);
  }
}

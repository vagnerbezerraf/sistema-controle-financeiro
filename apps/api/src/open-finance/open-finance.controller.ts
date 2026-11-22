import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  JwtAuthGuard,
  Roles,
  SpaceRoleGuard,
  type AuthenticatedUser,
} from '../common/auth/auth.guard';
import { OpenFinanceService } from './open-finance.service';
import { CreateOpenFinanceConsentRequest, SyncOpenFinanceConsentRequest } from './http/dto';

@ApiTags('open-finance')
@Controller('financial-spaces/:spaceId/open-finance')
@UseGuards(JwtAuthGuard, SpaceRoleGuard)
@ApiBearerAuth('access-token')
export class OpenFinanceController {
  constructor(private readonly openFinance: OpenFinanceService) {}

  @Get('institutions')
  @Roles(['owner', 'admin', 'contributor', 'viewer'])
  @ApiOperation({ summary: 'Listar instituicoes de Open Finance e o consentimento do espaco' })
  async institutions(@Param('spaceId') spaceId: string) {
    return this.openFinance.listInstitutions(spaceId);
  }

  @Get('consents')
  @Roles(['owner', 'admin', 'contributor', 'viewer'])
  @ApiOperation({ summary: 'Listar consentimentos de Open Finance do espaco' })
  async consents(@Param('spaceId') spaceId: string) {
    return this.openFinance.listConsents(spaceId);
  }

  @Post('consents')
  @Roles(['owner', 'admin', 'contributor'])
  @ApiOperation({ summary: 'Criar consentimento para uma instituicao' })
  async create(
    @Param('spaceId') spaceId: string,
    @Body() body: CreateOpenFinanceConsentRequest,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.openFinance.createConsent(spaceId, body, user.sub);
  }

  @Post('consents/:consentId/refresh')
  @HttpCode(200)
  @Roles(['owner', 'admin', 'contributor'])
  @ApiOperation({ summary: 'Consultar o provedor e atualizar a situacao do consentimento' })
  async refresh(
    @Param('spaceId') spaceId: string,
    @Param('consentId') consentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.openFinance.refreshConsent(spaceId, consentId, user.sub);
  }

  @Post('consents/:consentId/sync')
  @HttpCode(200)
  @Roles(['owner', 'admin', 'contributor'])
  @ApiOperation({ summary: 'Sincronizar lancamentos do consentimento (importacao incremental)' })
  async sync(
    @Param('spaceId') spaceId: string,
    @Param('consentId') consentId: string,
    @Body() body: SyncOpenFinanceConsentRequest,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.openFinance.syncConsent(spaceId, consentId, body, user.sub);
  }

  @Delete('consents/:consentId')
  @Roles(['owner', 'admin', 'contributor'])
  @ApiOperation({ summary: 'Revogar um consentimento de Open Finance' })
  async revoke(
    @Param('spaceId') spaceId: string,
    @Param('consentId') consentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.openFinance.revokeConsent(spaceId, consentId, user.sub);
  }
}

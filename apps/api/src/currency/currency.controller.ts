import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  JwtAuthGuard,
  Roles,
  SpaceRoleGuard,
  type AuthenticatedUser,
} from '../common/auth/auth.guard';
import { CurrencyService } from './currency.service';
import { CreateExchangeRateRequest, UpdateExchangeRateRequest } from './http/dto';

@ApiTags('exchange-rates')
@Controller('financial-spaces/:spaceId/exchange-rates')
@UseGuards(JwtAuthGuard, SpaceRoleGuard)
@ApiBearerAuth('access-token')
export class CurrencyController {
  constructor(private readonly currency: CurrencyService) {}

  @Get()
  @Roles(['owner', 'admin', 'contributor', 'viewer'])
  @ApiOperation({ summary: 'Listar taxas de cambio do espaco financeiro' })
  async list(@Param('spaceId') spaceId: string) {
    return this.currency.list(spaceId);
  }

  @Post()
  @Roles(['owner', 'admin', 'contributor'])
  @ApiOperation({ summary: 'Criar taxa de cambio entre duas moedas' })
  async create(
    @Param('spaceId') spaceId: string,
    @Body() body: CreateExchangeRateRequest,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.currency.create(spaceId, body, user.sub);
  }

  @Patch(':rateId')
  @Roles(['owner', 'admin', 'contributor'])
  @ApiOperation({ summary: 'Atualizar taxa de cambio (concorrencia otimista via `version`)' })
  async update(
    @Param('spaceId') spaceId: string,
    @Param('rateId') rateId: string,
    @Body() body: UpdateExchangeRateRequest,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.currency.update(spaceId, rateId, body, user.sub);
  }

  @Delete(':rateId')
  @Roles(['owner', 'admin', 'contributor'])
  @ApiOperation({ summary: 'Remover taxa de cambio' })
  async remove(
    @Param('spaceId') spaceId: string,
    @Param('rateId') rateId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.currency.remove(spaceId, rateId, user.sub);
  }
}

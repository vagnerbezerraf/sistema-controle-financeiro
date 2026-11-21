import { Body, Controller, Get, Param, Post, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  CurrentUser,
  JwtAuthGuard,
  Roles,
  SpaceRoleGuard,
  type AuthenticatedUser,
} from '../common/auth/auth.guard';
import { ReportsService } from './reports.service';
import { CreateReportJobRequest } from './http/dto';

@ApiTags('reports')
@Controller('financial-spaces/:spaceId/reports')
@UseGuards(JwtAuthGuard, SpaceRoleGuard)
@ApiBearerAuth('access-token')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get()
  @Roles(['owner', 'admin', 'contributor', 'viewer'])
  @ApiOperation({ summary: 'Listar os relatorios assincronos do espaco (mais recentes primeiro)' })
  async list(@Param('spaceId') spaceId: string) {
    return this.reports.list(spaceId);
  }

  @Post()
  @Roles(['owner', 'admin', 'contributor'])
  @ApiOperation({ summary: 'Enfileirar a geracao de um relatorio (processado em background)' })
  async create(
    @Param('spaceId') spaceId: string,
    @Body() body: CreateReportJobRequest,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reports.create(spaceId, body, user.sub);
  }

  @Get(':jobId')
  @Roles(['owner', 'admin', 'contributor', 'viewer'])
  @ApiOperation({ summary: 'Consultar o status de um relatorio assincrono' })
  async get(@Param('spaceId') spaceId: string, @Param('jobId') jobId: string) {
    return this.reports.get(spaceId, jobId);
  }

  @Get(':jobId/download')
  @Roles(['owner', 'admin', 'contributor', 'viewer'])
  @ApiOperation({ summary: 'Baixar o conteudo do relatorio quando ele estiver pronto' })
  async download(
    @Param('spaceId') spaceId: string,
    @Param('jobId') jobId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const file = await this.reports.download(spaceId, jobId);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
    return file.content;
  }
}

import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  JwtAuthGuard,
  Roles,
  SpaceRoleGuard,
  type AuthenticatedUser,
} from '../common/auth/auth.guard';
import { ImportsService } from './imports.service';
import { ListImportsQuery, PreviewCsvImportRequest, PreviewOfxImportRequest } from './http/dto';

@ApiTags('imports')
@Controller('financial-spaces/:spaceId/imports')
@UseGuards(JwtAuthGuard, SpaceRoleGuard)
@ApiBearerAuth('access-token')
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @Get()
  @Roles(['owner', 'admin', 'contributor', 'viewer'])
  @ApiOperation({ summary: 'Listar lotes de importacao (auditoria)' })
  async list(@Param('spaceId') spaceId: string, @Query() query: ListImportsQuery) {
    return this.imports.list(spaceId, query.status);
  }

  @Post('preview')
  @Roles(['owner', 'admin', 'contributor'])
  @ApiOperation({ summary: 'Gerar a previa da importacao de um CSV (nao aplica)' })
  async preview(@Param('spaceId') spaceId: string, @Body() body: PreviewCsvImportRequest) {
    return this.imports.preview(spaceId, body.accountId, body.csv, 'csv', body.fileName);
  }

  @Post('preview-ofx')
  @Roles(['owner', 'admin', 'contributor'])
  @ApiOperation({ summary: 'Gerar a previa da importacao de um OFX (nao aplica)' })
  async previewOfx(@Param('spaceId') spaceId: string, @Body() body: PreviewOfxImportRequest) {
    return this.imports.preview(spaceId, body.accountId, body.ofx, 'ofx', body.fileName);
  }

  @Get(':batchId')
  @Roles(['owner', 'admin', 'contributor', 'viewer'])
  @ApiOperation({ summary: 'Detalhe do lote com as linhas reclassificadas' })
  async detail(@Param('spaceId') spaceId: string, @Param('batchId') batchId: string) {
    return this.imports.detail(spaceId, batchId);
  }

  @Post(':batchId/commit')
  @Roles(['owner', 'admin', 'contributor'])
  @ApiOperation({ summary: 'Aplicar o lote: criar os lancamentos das linhas validas' })
  async commit(
    @Param('spaceId') spaceId: string,
    @Param('batchId') batchId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.imports.commit(spaceId, batchId, user.sub);
  }

  @Delete(':batchId')
  @Roles(['owner', 'admin', 'contributor'])
  @ApiOperation({ summary: 'Desfazer a importacao (cancelamento logico dos lancamentos)' })
  async undo(
    @Param('spaceId') spaceId: string,
    @Param('batchId') batchId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.imports.undo(spaceId, batchId, user.sub);
  }
}

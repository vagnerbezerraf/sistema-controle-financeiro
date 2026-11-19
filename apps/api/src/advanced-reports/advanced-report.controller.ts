import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard, Roles, SpaceRoleGuard } from '../common/auth/auth.guard';
import { AdvancedReportService } from './advanced-report.service';
import { AdvancedReportQuery } from './http/dto';

@ApiTags('advanced-reports')
@Controller('financial-spaces/:spaceId/summary/advanced-report')
@UseGuards(JwtAuthGuard, SpaceRoleGuard)
@ApiBearerAuth('access-token')
export class AdvancedReportController {
  constructor(private readonly report: AdvancedReportService) {}

  @Get()
  @Roles(['owner', 'admin', 'contributor', 'viewer'])
  @ApiOperation({ summary: 'Patrimonio liquido, taxa de poupanca e evolucao mensal' })
  async view(@Param('spaceId') spaceId: string, @Query() query: AdvancedReportQuery) {
    return this.report.build(spaceId, { month: query.month, months: query.months });
  }
}

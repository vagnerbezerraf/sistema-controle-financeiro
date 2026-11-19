import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard, Roles, SpaceRoleGuard } from '../common/auth/auth.guard';
import { MonthlyComparisonQuery } from './http/dto';
import { MonthlyComparisonService } from './monthly-comparison.service';

@ApiTags('monthly-comparison')
@Controller('financial-spaces/:spaceId/summary/monthly-comparison')
@UseGuards(JwtAuthGuard, SpaceRoleGuard)
@ApiBearerAuth('access-token')
export class MonthlyComparisonController {
  constructor(private readonly comparison: MonthlyComparisonService) {}

  @Get()
  @Roles(['owner', 'admin', 'contributor', 'viewer'])
  @ApiOperation({ summary: 'Comparacao dos totais realizados do mes com o mes anterior' })
  async view(@Param('spaceId') spaceId: string, @Query() query: MonthlyComparisonQuery) {
    const month = query.month ?? new Date().toISOString().slice(0, 7);
    return this.comparison.compare(spaceId, month);
  }
}

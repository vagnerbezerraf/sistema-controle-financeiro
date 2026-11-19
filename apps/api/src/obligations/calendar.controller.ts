import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard, Roles, SpaceRoleGuard } from '../common/auth/auth.guard';
import { buildCalendar, defaultMonthRange } from './domain/calendar';
import { CalendarQuery } from './http/dto';
import { PendingEntriesService } from './pending-entries.service';

@ApiTags('calendar')
@Controller('financial-spaces/:spaceId/calendar')
@UseGuards(JwtAuthGuard, SpaceRoleGuard)
@ApiBearerAuth('access-token')
export class CalendarController {
  constructor(private readonly pendingEntries: PendingEntriesService) {}

  @Get()
  @Roles(['owner', 'admin', 'contributor', 'viewer'])
  @ApiOperation({ summary: 'Calendario financeiro: vencimentos de contas e faturas por dia' })
  async view(@Param('spaceId') spaceId: string, @Query() query: CalendarQuery) {
    const month = defaultMonthRange();
    const range = { from: query.from ?? month.from, to: query.to ?? month.to };
    const entries = await this.pendingEntries.listPending(spaceId, range);
    return buildCalendar(entries, range);
  }
}

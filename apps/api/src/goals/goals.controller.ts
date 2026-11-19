import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Prisma, PrismaClient } from '@prisma/client';
import { JwtAuthGuard, Roles, SpaceRoleGuard } from '../common/auth/auth.guard';
import { toDate } from '../common/utils/date';
import { buildGoalsView, todayIso, type GoalInput } from './domain/goal';
import { CreateGoalRequest, GoalContributionRequest, UpdateGoalRequest } from './http/dto';

const iso = (date: Date): string => date.toISOString().slice(0, 10);

const toInput = (goal: {
  id: string;
  name: string;
  targetAmount: Prisma.Decimal;
  currentAmount: Prisma.Decimal;
  deadline: Date | null;
  color: string | null;
  icon: string | null;
  state: string;
}): GoalInput => ({
  id: goal.id,
  name: goal.name,
  targetAmount: goal.targetAmount.toString(),
  currentAmount: goal.currentAmount.toString(),
  deadline: goal.deadline ? iso(goal.deadline) : null,
  color: goal.color,
  icon: goal.icon,
  state: goal.state as 'active' | 'archived',
});

@ApiTags('goals')
@Controller('financial-spaces/:spaceId/goals')
@UseGuards(JwtAuthGuard, SpaceRoleGuard)
@ApiBearerAuth('access-token')
export class GoalsController {
  constructor(private readonly prisma: PrismaClient) {}

  @Get()
  @Roles(['owner', 'admin', 'contributor', 'viewer'])
  @ApiOperation({ summary: 'Metas com o progresso acumulado' })
  async list(@Param('spaceId') spaceId: string) {
    const goals = await this.prisma.goal.findMany({
      where: { financialSpaceId: spaceId },
      orderBy: [{ state: 'asc' }, { createdAt: 'asc' }],
    });
    return buildGoalsView(todayIso(), goals.map(toInput));
  }

  @Post()
  @Roles(['owner', 'admin', 'contributor'])
  @ApiOperation({ summary: 'Criar meta' })
  async create(@Param('spaceId') spaceId: string, @Body() body: CreateGoalRequest) {
    this.assertName(body.name);
    this.assertTarget(body.targetAmount);

    return this.prisma.goal.create({
      data: {
        financialSpaceId: spaceId,
        name: body.name.trim(),
        targetAmount: body.targetAmount,
        deadline: body.deadline ? toDate(body.deadline) : null,
        color: body.color ?? null,
        icon: body.icon ?? null,
      },
    });
  }

  @Patch(':goalId')
  @Roles(['owner', 'admin', 'contributor'])
  @ApiOperation({ summary: 'Atualizar meta (nome, alvo, prazo, cor, icone, situacao)' })
  async update(
    @Param('spaceId') spaceId: string,
    @Param('goalId') goalId: string,
    @Body() body: UpdateGoalRequest,
  ) {
    const existing = await this.findGoal(spaceId, goalId);
    if (body.name !== undefined) this.assertName(body.name);
    if (body.targetAmount !== undefined) this.assertTarget(body.targetAmount);

    const data: Prisma.GoalUpdateInput = {};
    if (body.name !== undefined) data.name = body.name.trim();
    if (body.targetAmount !== undefined) data.targetAmount = body.targetAmount;
    if (body.deadline !== undefined) data.deadline = body.deadline === null ? null : toDate(body.deadline);
    if (body.color !== undefined) data.color = body.color;
    if (body.icon !== undefined) data.icon = body.icon;
    if (body.state !== undefined) data.state = body.state;

    return this.prisma.goal.update({ where: { id: existing.id }, data });
  }

  @Post(':goalId/contributions')
  @Roles(['owner', 'admin', 'contributor'])
  @ApiOperation({ summary: 'Registrar contribuicao: incrementa o acumulado da meta' })
  async contribute(
    @Param('spaceId') spaceId: string,
    @Param('goalId') goalId: string,
    @Body() body: GoalContributionRequest,
  ) {
    const existing = await this.findGoal(spaceId, goalId);
    const value = Number(body.amount);
    if (!Number.isFinite(value) || value <= 0) {
      throw new BadRequestException({
        code: 'INVALID_GOAL_CONTRIBUTION',
        message: 'A contribuicao deve ser maior que zero',
      });
    }

    return this.prisma.goal.update({
      where: { id: existing.id },
      data: { currentAmount: { increment: new Prisma.Decimal(body.amount) } },
    });
  }

  @Delete(':goalId')
  @Roles(['owner', 'admin', 'contributor'])
  @ApiOperation({ summary: 'Remover meta' })
  async remove(@Param('spaceId') spaceId: string, @Param('goalId') goalId: string) {
    const existing = await this.findGoal(spaceId, goalId);
    await this.prisma.goal.delete({ where: { id: existing.id } });
    return { deleted: true };
  }

  private async findGoal(spaceId: string, goalId: string) {
    const goal = await this.prisma.goal.findFirst({ where: { id: goalId, financialSpaceId: spaceId } });
    if (!goal) throw new NotFoundException('Meta nao encontrada');
    return goal;
  }

  private assertName(name: string) {
    if (!name || name.trim().length === 0) {
      throw new BadRequestException({ code: 'INVALID_GOAL_NAME', message: 'O nome da meta e obrigatorio' });
    }
  }

  private assertTarget(targetAmount: string) {
    const value = Number(targetAmount);
    if (!Number.isFinite(value) || value <= 0) {
      throw new BadRequestException({ code: 'INVALID_GOAL_TARGET', message: 'O valor-alvo deve ser maior que zero' });
    }
  }
}

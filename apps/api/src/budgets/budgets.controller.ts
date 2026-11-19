import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Prisma, PrismaClient } from '@prisma/client';
import { JwtAuthGuard, Roles, SpaceRoleGuard } from '../common/auth/auth.guard';
import { toDate } from '../common/utils/date';
import { currentMonthRange } from './domain/budget';
import { BudgetsService } from './budgets.service';
import { CreateBudgetRequest, ListBudgetsQuery, UpdateBudgetRequest } from './http/dto';

@ApiTags('budgets')
@Controller('financial-spaces/:spaceId/budgets')
@UseGuards(JwtAuthGuard, SpaceRoleGuard)
@ApiBearerAuth('access-token')
export class BudgetsController {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly budgets: BudgetsService,
  ) {}

  @Get()
  @Roles(['owner', 'admin', 'contributor', 'viewer'])
  @ApiOperation({ summary: 'Orcamentos do periodo com o consumo realizado por categoria' })
  async list(@Param('spaceId') spaceId: string, @Query() query: ListBudgetsQuery) {
    const month = currentMonthRange();
    const window = { from: query.from ?? month.from, to: query.to ?? month.to };
    return this.budgets.read(spaceId, window);
  }

  @Post()
  @Roles(['owner', 'admin', 'contributor'])
  @ApiOperation({ summary: 'Criar orcamento por categoria e periodo' })
  async create(@Param('spaceId') spaceId: string, @Body() body: CreateBudgetRequest) {
    this.assertValidLimit(body.amountLimit);
    this.assertValidPeriod(body.periodStart, body.periodEnd);
    if (body.categoryId) await this.assertCategory(spaceId, body.categoryId);

    const periodStart = toDate(body.periodStart);
    const periodEnd = toDate(body.periodEnd);
    const duplicate = await this.prisma.budget.findFirst({
      where: { financialSpaceId: spaceId, periodStart, periodEnd, categoryId: body.categoryId ?? null },
    });
    if (duplicate) {
      throw new ConflictException({
        code: 'BUDGET_ALREADY_EXISTS',
        message: 'Ja existe um orcamento para esta categoria e periodo',
      });
    }

    return this.prisma.budget.create({
      data: {
        financialSpaceId: spaceId,
        periodStart,
        periodEnd,
        amountLimit: body.amountLimit,
        categoryId: body.categoryId ?? null,
      },
      include: { category: { select: { name: true } } },
    });
  }

  @Patch(':budgetId')
  @Roles(['owner', 'admin', 'contributor'])
  @ApiOperation({ summary: 'Atualizar o limite ou a categoria do orcamento' })
  async update(
    @Param('spaceId') spaceId: string,
    @Param('budgetId') budgetId: string,
    @Body() body: UpdateBudgetRequest,
  ) {
    const existing = await this.prisma.budget.findFirst({ where: { id: budgetId, financialSpaceId: spaceId } });
    if (!existing) throw new NotFoundException('Orcamento nao encontrado');
    if (body.amountLimit !== undefined) this.assertValidLimit(body.amountLimit);
    if (body.categoryId) await this.assertCategory(spaceId, body.categoryId);

    const data: Prisma.BudgetUpdateInput = {};
    if (body.amountLimit !== undefined) data.amountLimit = body.amountLimit;
    if (body.categoryId !== undefined) {
      data.category =
        body.categoryId === null ? { disconnect: true } : { connect: { id: body.categoryId } };
    }

    return this.prisma.budget.update({
      where: { id: budgetId },
      data,
      include: { category: { select: { name: true } } },
    });
  }

  @Delete(':budgetId')
  @Roles(['owner', 'admin', 'contributor'])
  @ApiOperation({ summary: 'Remover orcamento' })
  async remove(@Param('spaceId') spaceId: string, @Param('budgetId') budgetId: string) {
    const existing = await this.prisma.budget.findFirst({ where: { id: budgetId, financialSpaceId: spaceId } });
    if (!existing) throw new NotFoundException('Orcamento nao encontrado');
    await this.prisma.budget.delete({ where: { id: budgetId } });
    return { deleted: true };
  }

  private assertValidLimit(amountLimit: string) {
    const value = Number(amountLimit);
    if (!Number.isFinite(value) || value <= 0) {
      throw new BadRequestException({
        code: 'INVALID_BUDGET_LIMIT',
        message: 'O limite do orcamento deve ser maior que zero',
      });
    }
  }

  private assertValidPeriod(periodStart: string, periodEnd: string) {
    if (periodEnd < periodStart) {
      throw new BadRequestException({
        code: 'INVALID_BUDGET_PERIOD',
        message: 'O fim do periodo deve ser posterior ou igual ao inicio',
      });
    }
  }

  /** Garante que a categoria alvo pertence ao espaco (evita referencia cruzada). */
  private async assertCategory(spaceId: string, categoryId: string) {
    const count = await this.prisma.category.count({ where: { id: categoryId, financialSpaceId: spaceId } });
    if (count === 0) {
      throw new BadRequestException({
        code: 'INVALID_CATEGORY',
        message: 'Categoria nao pertence a este espaco financeiro',
      });
    }
  }
}

import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaClient, Category } from '@prisma/client';
import {
  JwtAuthGuard,
  Roles,
  SpaceRoleGuard,
} from '../common/auth/auth.guard';
import { CreateCategoryRequest, UpdateCategoryRequest } from './http/dto';
import { updateWithOptimisticLock } from '../common/utils/optimistic-lock';

const DEFAULT_CATEGORIES: Array<{ name: string; type: 'income' | 'expense' | 'both'; color: string; icon?: string }> = [
  { name: 'Salario', type: 'income', color: '#158441', icon: 'wallet' },
  { name: 'Investimentos', type: 'income', color: '#1e57f5', icon: 'trending-up' },
  { name: 'Freelance', type: 'income', color: '#22a552', icon: 'briefcase' },
  { name: 'Moradia', type: 'expense', color: '#1e57f5', icon: 'home' },
  { name: 'Alimentacao', type: 'expense', color: '#22a552', icon: 'utensils' },
  { name: 'Transporte', type: 'expense', color: '#ff850a', icon: 'car' },
  { name: 'Saude', type: 'expense', color: '#ef4444', icon: 'heart' },
  { name: 'Educacao', type: 'expense', color: '#8b5cf6', icon: 'book' },
  { name: 'Lazer', type: 'expense', color: '#ec4899', icon: 'smile' },
  { name: 'Servicos', type: 'expense', color: '#64748b', icon: 'zap' },
  { name: 'Outros', type: 'both', color: '#64748b', icon: 'tag' },
];

@ApiTags('categories')
@Controller('financial-spaces/:spaceId/categories')
@UseGuards(JwtAuthGuard, SpaceRoleGuard)
@ApiBearerAuth('access-token')
export class CategoriesController {
  constructor(private readonly prisma: PrismaClient) {}

  @Get()
  @Roles(['owner', 'admin', 'contributor', 'viewer'])
  @ApiOperation({ summary: 'Listar categorias do espaco financeiro' })
  async list(@Param('spaceId') spaceId: string): Promise<Category[]> {
    const count = await this.prisma.category.count({ where: { financialSpaceId: spaceId } });
    if (count === 0) {
      await this.prisma.category.createMany({
        data: DEFAULT_CATEGORIES.map((c) => ({
          financialSpaceId: spaceId,
          name: c.name,
          type: c.type,
          color: c.color,
          icon: c.icon,
        })),
      });
    }
    return this.prisma.category.findMany({
      where: { financialSpaceId: spaceId },
      orderBy: [{ type: 'asc' }, { parentId: 'asc' }, { name: 'asc' }],
    });
  }

  @Post()
  @Roles(['owner', 'admin', 'contributor'])
  @ApiOperation({ summary: 'Criar categoria' })
  async create(@Param('spaceId') spaceId: string, @Body() body: CreateCategoryRequest): Promise<Category> {
    return this.prisma.category.create({
      data: {
        financialSpaceId: spaceId,
        name: body.name,
        type: body.type,
        color: body.color,
        icon: body.icon,
        parentId: body.parentId,
      },
    });
  }

  @Patch(':categoryId')
  @Roles(['owner', 'admin', 'contributor'])
  @ApiOperation({ summary: 'Atualizar categoria (concorrencia otimista via `version`)' })
  async update(
    @Param('spaceId') spaceId: string,
    @Param('categoryId') categoryId: string,
    @Body() body: UpdateCategoryRequest,
  ): Promise<Category> {
    const { version, ...data } = body;
    const scope = { id: categoryId, financialSpaceId: spaceId };

    return updateWithOptimisticLock<Category>({
      applyConditionalUpdate: async () => {
        const res = await this.prisma.category.updateMany({
          where: version === undefined ? scope : { ...scope, version },
          data: { ...data, version: { increment: 1 } },
        });
        return res.count;
      },
      exists: async () => (await this.prisma.category.count({ where: scope })) > 0,
      reload: () => this.prisma.category.findUniqueOrThrow({ where: { id: categoryId } }),
      notFoundMessage: 'Categoria nao encontrada',
      staleMessage: 'Categoria foi alterada por outra sessao; recarregue e tente novamente',
    });
  }
}

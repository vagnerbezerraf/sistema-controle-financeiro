import {
  Body,
  Controller,
  Get,
  NotFoundException,
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
  @ApiOperation({ summary: 'Atualizar categoria' })
  async update(
    @Param('spaceId') spaceId: string,
    @Param('categoryId') categoryId: string,
    @Body() body: UpdateCategoryRequest,
  ): Promise<Category> {
    const cat = await this.prisma.category.findUnique({ where: { id: categoryId, financialSpaceId: spaceId } });
    if (!cat) throw new NotFoundException('Categoria nao encontrada');
    return this.prisma.category.update({ where: { id: categoryId }, data: body });
  }
}

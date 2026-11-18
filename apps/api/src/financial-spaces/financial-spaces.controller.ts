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
import { FinancialSpace, FinancialSpaceRole, PrismaClient } from '@prisma/client';
import {
  CurrentUser,
  JwtAuthGuard,
  Roles,
  SpaceRoleGuard,
  AuthenticatedUser,
} from '../common/auth/auth.guard';
import {
  CreateFinancialSpaceRequest,
  InviteMemberRequest,
  UpdateFinancialSpaceRequest,
} from './http/dto';
import { updateWithOptimisticLock } from '../common/utils/optimistic-lock';

@ApiTags('financial-spaces')
@Controller('financial-spaces')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
export class FinancialSpacesController {
  constructor(private readonly prisma: PrismaClient) {}

  @Get()
  @ApiOperation({ summary: 'Listar espacos financeiros do usuario' })
  async listForUser(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.financialSpace.findMany({
      where: { id: { in: user.spaceIds } },
      orderBy: { createdAt: 'desc' },
      include: {
        memberships: {
          where: { userId: user.sub },
          select: { role: true, status: true },
        },
      },
    }).then((list) =>
      list.map((s) => ({
        ...s,
        userRole: s.memberships[0]?.role,
        memberships: undefined,
      })),
    );
  }

  @Post()
  @ApiOperation({ summary: 'Criar espaco financeiro' })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateFinancialSpaceRequest) {
    return this.prisma.financialSpace.create({
      data: {
        name: body.name,
        primaryCurrency: body.primaryCurrency ?? 'BRL',
        timezone: body.timezone ?? 'America/Sao_Paulo',
        memberships: { create: { userId: user.sub, role: 'owner' } },
      },
    });
  }

  @Get(':spaceId')
  @UseGuards(SpaceRoleGuard)
  @Roles([FinancialSpaceRole.owner, FinancialSpaceRole.admin, FinancialSpaceRole.contributor, FinancialSpaceRole.viewer])
  @ApiOperation({ summary: 'Detalhes do espaco financeiro' })
  async detail(@Param('spaceId') spaceId: string) {
    const space = await this.prisma.financialSpace.findUnique({ where: { id: spaceId } });
    if (!space) throw new NotFoundException('Espaco financeiro nao encontrado');
    return space;
  }

  @Patch(':spaceId')
  @UseGuards(SpaceRoleGuard)
  @Roles([FinancialSpaceRole.owner, FinancialSpaceRole.admin])
  @ApiOperation({ summary: 'Atualizar espaco financeiro (concorrencia otimista via `version`)' })
  async update(@Param('spaceId') spaceId: string, @Body() body: UpdateFinancialSpaceRequest): Promise<FinancialSpace> {
    const { version, ...data } = body;
    const scope = { id: spaceId };

    return updateWithOptimisticLock<FinancialSpace>({
      applyConditionalUpdate: async () => {
        const res = await this.prisma.financialSpace.updateMany({
          where: version === undefined ? scope : { ...scope, version },
          data: { ...data, version: { increment: 1 } },
        });
        return res.count;
      },
      exists: async () => (await this.prisma.financialSpace.count({ where: scope })) > 0,
      reload: () => this.prisma.financialSpace.findUniqueOrThrow({ where: { id: spaceId } }),
      notFoundMessage: 'Espaco financeiro nao encontrado',
      staleMessage: 'Espaco financeiro foi alterado por outra sessao; recarregue e tente novamente',
    });
  }

  @Get(':spaceId/members')
  @UseGuards(SpaceRoleGuard)
  @Roles([FinancialSpaceRole.owner, FinancialSpaceRole.admin, FinancialSpaceRole.contributor, FinancialSpaceRole.viewer])
  @ApiOperation({ summary: 'Listar membros do espaco financeiro' })
  async members(@Param('spaceId') spaceId: string) {
    return this.prisma.membership.findMany({
      where: { financialSpaceId: spaceId },
      include: { user: { select: { email: true, name: true } } },
    }).then((list) =>
      list.map((m) => ({
        id: m.id,
        role: m.role,
        status: m.status,
        email: m.invitedEmail ?? m.user.email,
        name: m.user.name ?? null,
        invitedAt: m.invitedAt,
      })),
    );
  }

  @Post(':spaceId/members')
  @UseGuards(SpaceRoleGuard)
  @Roles([FinancialSpaceRole.owner, FinancialSpaceRole.admin])
  @ApiOperation({ summary: 'Convidar membro (MVP: auto-aceita se usuario existir)' })
  async invite(@Param('spaceId') spaceId: string, @Body() body: InviteMemberRequest) {
    const targetUser = await this.prisma.user.findUnique({ where: { email: body.email.trim().toLowerCase() } });
    if (targetUser) {
      return this.prisma.membership.upsert({
        where: { financialSpaceId_userId: { financialSpaceId: spaceId, userId: targetUser.id } },
        update: { role: body.role, status: 'active', revokedAt: null },
        create: {
          financialSpaceId: spaceId,
          userId: targetUser.id,
          role: body.role,
          status: 'active',
          invitedEmail: body.email,
          invitedAt: new Date(),
          inviteAcceptedAt: new Date(),
        },
      });
    }
    return this.prisma.membership.create({
      data: {
        financialSpaceId: spaceId,
        userId: (await this.prisma.user.findFirstOrThrow({ select: { id: true } })).id,
        role: body.role,
        status: 'invited',
        invitedEmail: body.email,
        invitedAt: new Date(),
      },
    });
  }
}

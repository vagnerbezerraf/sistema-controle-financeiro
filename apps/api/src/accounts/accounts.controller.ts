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
import { PrismaClient, Account } from '@prisma/client';
import {
  CurrentUser,
  JwtAuthGuard,
  Roles,
  SpaceRoleGuard,
  AuthenticatedUser,
} from '../common/auth/auth.guard';
import { CreateAccountRequest, UpdateAccountRequest } from './http/dto';

@ApiTags('accounts')
@Controller('financial-spaces/:spaceId/accounts')
@UseGuards(JwtAuthGuard, SpaceRoleGuard)
@ApiBearerAuth('access-token')
export class AccountsController {
  constructor(private readonly prisma: PrismaClient) {}

  @Get()
  @Roles(['owner', 'admin', 'contributor', 'viewer'])
  @ApiOperation({ summary: 'Listar contas do espaco financeiro' })
  async list(@Param('spaceId') spaceId: string): Promise<Account[]> {
    return this.prisma.account.findMany({
      where: { financialSpaceId: spaceId },
      orderBy: [{ state: 'asc' }, { createdAt: 'desc' }],
    });
  }

  @Post()
  @Roles(['owner', 'admin', 'contributor'])
  @ApiOperation({ summary: 'Criar conta' })
  async create(
    @Param('spaceId') spaceId: string,
    @Body() body: CreateAccountRequest,
    @CurrentUser() _user: AuthenticatedUser,
  ): Promise<Account> {
    return this.prisma.$transaction(async (tx) => {
      const account = await tx.account.create({
        data: {
          financialSpaceId: spaceId,
          name: body.name,
          type: body.type,
          currency: body.currency ?? 'BRL',
          initialBalance: body.initialBalance ?? '0',
          initialBalanceDate: body.initialBalanceDate ?? new Date().toISOString().slice(0, 10),
          institution: body.institution,
          branch: body.branch,
          number: body.number,
          color: body.color,
          icon: body.icon,
        },
      });

      if (body.initialBalance && Number(body.initialBalance) !== 0) {
        await tx.transaction.create({
          data: {
            financialSpaceId: spaceId,
            type: 'adjustment',
            status: 'confirmed',
            description: `Saldo inicial - ${account.name}`,
            currency: account.currency,
            totalAmount: body.initialBalance,
            effectiveDate: account.initialBalanceDate,
            postings: {
              create: {
                accountId: account.id,
                amount: body.initialBalance,
                direction: Number(body.initialBalance) >= 0 ? 'debit' : 'credit',
                effectiveDate: account.initialBalanceDate,
              },
            },
          },
        });
      }

      return account;
    });
  }

  @Get(':accountId')
  @Roles(['owner', 'admin', 'contributor', 'viewer'])
  @ApiOperation({ summary: 'Detalhes da conta' })
  async detail(@Param('spaceId') spaceId: string, @Param('accountId') accountId: string): Promise<Account> {
    const acc = await this.prisma.account.findUnique({
      where: { id: accountId, financialSpaceId: spaceId },
    });
    if (!acc) throw new NotFoundException('Conta nao encontrada');
    return acc;
  }

  @Patch(':accountId')
  @Roles(['owner', 'admin', 'contributor'])
  @ApiOperation({ summary: 'Atualizar conta' })
  async update(
    @Param('spaceId') spaceId: string,
    @Param('accountId') accountId: string,
    @Body() body: UpdateAccountRequest,
  ): Promise<Account> {
    return this.prisma.account.update({
      where: { id: accountId, financialSpaceId: spaceId },
      data: body,
    });
  }
}

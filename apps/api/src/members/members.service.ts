import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient, type FinancialSpaceRole, type SpaceInvite as SpaceInviteRow } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import type {
  AcceptSpaceInviteResponse,
  CreateSpaceInviteRequest,
  CreateSpaceInviteResponse,
  SpaceInvite,
  SpaceMember,
} from '@scf/api-contracts';
import {
  canAssignRole,
  canChangeMemberRole,
  canManageMembers,
  canRemoveMember,
  isInviteUsable,
} from './domain/member-roles';

/** Validade padrao do convite, em dias. */
const INVITE_TTL_DAYS = 7;

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

function toInvite(row: SpaceInviteRow): SpaceInvite {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    status: row.status,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Membros, convites e papeis de um espaco financeiro compartilhado.
 * As regras de permissao ficam no dominio puro (`domain/member-roles`); aqui so
 * ha leitura/escrita e as validacoes que dependem do estado do banco.
 */
@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: ConfigService,
  ) {}

  /** Papel do usuario no espaco (deve ser membro ativo). */
  private async actorRole(spaceId: string, userId: string): Promise<FinancialSpaceRole> {
    const membership = await this.prisma.membership.findUnique({
      where: { financialSpaceId_userId: { financialSpaceId: spaceId, userId } },
    });
    if (!membership || membership.status !== 'active') {
      throw new ForbiddenException({
        code: 'NOT_A_MEMBER',
        message: 'Sem permissao nesse espaco financeiro',
      });
    }
    return membership.role;
  }

  async listMembers(spaceId: string): Promise<SpaceMember[]> {
    const members = await this.prisma.membership.findMany({
      where: { financialSpaceId: spaceId },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      include: { user: { select: { id: true, email: true, name: true } } },
    });
    return members.map((m) => ({
      id: m.id,
      userId: m.userId,
      email: m.user.email,
      name: m.user.name ?? null,
      role: m.role,
      status: m.status,
      joinedAt: m.inviteAcceptedAt ? m.inviteAcceptedAt.toISOString() : null,
    }));
  }

  async listInvites(spaceId: string): Promise<SpaceInvite[]> {
    const invites = await this.prisma.spaceInvite.findMany({
      where: { financialSpaceId: spaceId, status: 'pending' },
      orderBy: { createdAt: 'desc' },
    });
    return invites.map(toInvite);
  }

  async createInvite(
    spaceId: string,
    userId: string,
    input: CreateSpaceInviteRequest,
  ): Promise<CreateSpaceInviteResponse> {
    const actor = await this.actorRole(spaceId, userId);
    if (!canManageMembers(actor)) {
      throw new ForbiddenException({
        code: 'CANNOT_MANAGE_MEMBERS',
        message: 'Apenas proprietario ou administrador podem convidar',
      });
    }
    if (!canAssignRole(actor, input.role)) {
      throw new BadRequestException({
        code: 'ROLE_NOT_ASSIGNABLE',
        message: `O papel ${actor} nao pode convidar com o papel ${input.role}`,
      });
    }

    const email = input.email.trim().toLowerCase();
    const existing = await this.prisma.membership.findFirst({
      where: { financialSpaceId: spaceId, status: 'active', user: { email } },
    });
    if (existing) {
      throw new ConflictException({
        code: 'ALREADY_MEMBER',
        message: 'Este e-mail ja e membro do espaco financeiro',
      });
    }

    const token = randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000);

    const invite = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.spaceInvite.upsert({
        where: { financialSpaceId_email: { financialSpaceId: spaceId, email } },
        update: {
          role: input.role,
          status: 'pending',
          tokenHash: hashToken(token),
          invitedById: userId,
          expiresAt,
          acceptedAt: null,
          revokedAt: null,
        },
        create: {
          financialSpaceId: spaceId,
          email,
          role: input.role,
          status: 'pending',
          tokenHash: hashToken(token),
          invitedById: userId,
          expiresAt,
        },
      });
      await tx.auditLog.create({
        data: {
          financialSpaceId: spaceId,
          userId,
          operation: 'space.invite.created',
          entityType: 'SpaceInvite',
          entityId: saved.id,
          safeSummary: { email, role: input.role },
        },
      });
      return saved;
    });

    const webUrl = this.config.get<string>('app.WEB_APP_URL') ?? 'http://localhost:3000';
    return {
      invite: toInvite(invite),
      token,
      acceptUrl: `${webUrl}/app/invites/accept?token=${token}`,
    };
  }

  async revokeInvite(spaceId: string, userId: string, inviteId: string): Promise<void> {
    const actor = await this.actorRole(spaceId, userId);
    if (!canManageMembers(actor)) {
      throw new ForbiddenException({
        code: 'CANNOT_MANAGE_MEMBERS',
        message: 'Apenas proprietario ou administrador podem revogar convites',
      });
    }
    const invite = await this.prisma.spaceInvite.findFirst({
      where: { id: inviteId, financialSpaceId: spaceId },
    });
    if (!invite) throw new NotFoundException('Convite nao encontrado');
    if (invite.status !== 'pending') {
      throw new BadRequestException({
        code: 'INVITE_NOT_PENDING',
        message: 'Somente convites pendentes podem ser revogados',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.spaceInvite.update({
        where: { id: invite.id },
        data: { status: 'revoked', revokedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          financialSpaceId: spaceId,
          userId,
          operation: 'space.invite.revoked',
          entityType: 'SpaceInvite',
          entityId: invite.id,
          safeSummary: { email: invite.email },
        },
      });
    });
  }

  async changeMemberRole(
    spaceId: string,
    userId: string,
    memberId: string,
    nextRole: FinancialSpaceRole,
  ): Promise<SpaceMember> {
    const actor = await this.actorRole(spaceId, userId);
    const member = await this.prisma.membership.findFirst({
      where: { id: memberId, financialSpaceId: spaceId },
      include: { user: { select: { id: true, email: true, name: true } } },
    });
    if (!member) throw new NotFoundException('Membro nao encontrado');
    if (!canChangeMemberRole(actor, member.role, nextRole)) {
      throw new ForbiddenException({
        code: 'ROLE_CHANGE_NOT_ALLOWED',
        message: 'Voce nao pode aplicar esse papel a este membro',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.membership.update({ where: { id: member.id }, data: { role: nextRole } });
      await tx.auditLog.create({
        data: {
          financialSpaceId: spaceId,
          userId,
          operation: 'space.member.role_changed',
          entityType: 'Membership',
          entityId: member.id,
          safeSummary: { from: member.role, to: nextRole, email: member.user.email },
        },
      });
    });

    return {
      id: member.id,
      userId: member.userId,
      email: member.user.email,
      name: member.user.name ?? null,
      role: nextRole,
      status: member.status,
      joinedAt: member.inviteAcceptedAt ? member.inviteAcceptedAt.toISOString() : null,
    };
  }

  async removeMember(spaceId: string, userId: string, memberId: string): Promise<void> {
    const actor = await this.actorRole(spaceId, userId);
    const member = await this.prisma.membership.findFirst({
      where: { id: memberId, financialSpaceId: spaceId },
    });
    if (!member) throw new NotFoundException('Membro nao encontrado');
    if (member.userId === userId) {
      throw new BadRequestException({
        code: 'CANNOT_REMOVE_SELF',
        message: 'Voce nao pode remover a si mesmo do espaco',
      });
    }
    if (!canRemoveMember(actor, member.role)) {
      throw new ForbiddenException({
        code: 'MEMBER_REMOVE_NOT_ALLOWED',
        message: 'Voce nao pode remover este membro',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.membership.delete({ where: { id: member.id } });
      await tx.auditLog.create({
        data: {
          financialSpaceId: spaceId,
          userId,
          operation: 'space.member.removed',
          entityType: 'Membership',
          entityId: member.id,
          safeSummary: { role: member.role },
        },
      });
    });
  }

  /** Aceita um convite: cria/ativa a Membership do usuario autenticado. */
  async acceptInvite(userId: string, userEmail: string, token: string): Promise<AcceptSpaceInviteResponse> {
    const invite = await this.prisma.spaceInvite.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { financialSpace: { select: { name: true } } },
    });
    if (!invite || !isInviteUsable(invite, new Date())) {
      throw new BadRequestException({
        code: 'INVITE_INVALID',
        message: 'Convite invalido, revogado ou expirado',
      });
    }
    if (invite.email.toLowerCase() !== userEmail.trim().toLowerCase()) {
      throw new ForbiddenException({
        code: 'INVITE_EMAIL_MISMATCH',
        message: 'Este convite pertence a outro e-mail',
      });
    }

    const membership = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.membership.upsert({
        where: { financialSpaceId_userId: { financialSpaceId: invite.financialSpaceId, userId } },
        update: {
          role: invite.role,
          status: 'active',
          inviteAcceptedAt: new Date(),
          revokedAt: null,
        },
        create: {
          financialSpaceId: invite.financialSpaceId,
          userId,
          role: invite.role,
          status: 'active',
          invitedEmail: invite.email,
          invitedAt: invite.createdAt,
          inviteAcceptedAt: new Date(),
        },
      });
      await tx.spaceInvite.update({
        where: { id: invite.id },
        data: { status: 'accepted', acceptedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          financialSpaceId: invite.financialSpaceId,
          userId,
          operation: 'space.invite.accepted',
          entityType: 'SpaceInvite',
          entityId: invite.id,
          safeSummary: { email: invite.email, role: invite.role },
        },
      });
      return saved;
    });

    return {
      spaceId: invite.financialSpaceId,
      financialSpaceName: invite.financialSpace.name,
      role: membership.role,
    };
  }
}

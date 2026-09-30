import {
  Injectable,
  CanActivate,
  ExecutionContext,
  createParamDecorator,
  UnauthorizedException,
  ForbiddenException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, FinancialSpaceRole } from '@prisma/client';
import type { Request } from 'express';

export const Public = () => SetMetadata('isPublic', true);

export interface AuthenticatedUser {
  sub: string;
  email: string;
  spaceIds: string[];
  memberships: Array<{ spaceId: string; role: FinancialSpaceRole }>;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest<Request & { user: AuthenticatedUser }>();
    if (!request.user) throw new UnauthorizedException('Sessao invalida');
    return request.user;
  },
);

export const CurrentSpaceId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<Request & { params: { spaceId: string } }>();
    const spaceId = request.params.spaceId ?? request.headers['x-financial-space-id'];
    if (!spaceId) throw new ForbiddenException('Espaco financeiro nao informado');
    return String(spaceId);
  },
);

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaClient,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new UnauthorizedException('Token ausente');

    try {
      const payload = (await this.jwtService.verifyAsync(token)) as { sub: string; email: string };
      const memberships = await this.prisma.membership.findMany({
        where: { userId: payload.sub, status: 'active' },
        select: { financialSpaceId: true, role: true },
      });
      const user: AuthenticatedUser = {
        sub: payload.sub,
        email: payload.email,
        spaceIds: memberships.map((m) => m.financialSpaceId),
        memberships: memberships.map((m) => ({ spaceId: m.financialSpaceId, role: m.role })),
      };
      (req as any).user = user;
      return true;
    } catch {
      throw new UnauthorizedException('Token invalido ou expirado');
    }
  }
}

export const Roles = Reflector.createDecorator<FinancialSpaceRole[]>();

@Injectable()
export class SpaceRoleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    _prisma: PrismaClient,
  ) {
    void _prisma;
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.get(Roles, ctx.getHandler()) ?? [
      FinancialSpaceRole.owner,
      FinancialSpaceRole.admin,
      FinancialSpaceRole.contributor,
      FinancialSpaceRole.viewer,
    ];
    const req = ctx.switchToHttp().getRequest<Request & { user: AuthenticatedUser; params: { spaceId?: string } }>();
    const user = req.user;
    if (!user) return true;
    const spaceId =
      req.params.spaceId ??
      (req.headers['x-financial-space-id'] as string) ??
      (req.body?.financialSpaceId as string);

    if (!spaceId) return true;

    const membership = user.memberships.find((m) => m.spaceId === spaceId);
    if (!membership) {
      throw new ForbiddenException('Sem permissao nesse espaco financeiro');
    }
    if (!required.includes(membership.role)) {
      throw new ForbiddenException(`Papel ${membership.role} nao tem permissao para esta operacao`);
    }
    return true;
  }
}

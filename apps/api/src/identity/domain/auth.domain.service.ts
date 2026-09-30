import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

@Injectable()
export class AuthDomainService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly jwtService: JwtService,
  ) {}

  async register(input: { email: string; password?: string; name?: string; timezone?: string; locale?: string }): Promise<User> {
    const email = input.email.trim().toLowerCase();
    const exists = await this.prisma.user.findUnique({ where: { email } });
    if (exists) throw new ConflictException('E-mail ja cadastrado');

    const passwordHash = input.password ? await bcrypt.hash(input.password, 12) : null;

    return this.prisma.user.create({
      data: {
        email,
        name: input.name ?? undefined,
        passwordHash,
        timezone: input.timezone ?? 'America/Sao_Paulo',
        locale: input.locale ?? 'pt-BR',
      },
    });
  }

  async authenticateLocal(email: string, password: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!user || !user.passwordHash) throw new UnauthorizedException('Credenciais invalidas');

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Credenciais invalidas');

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return user;
  }

  async issueTokens(user: User, config: { accessTtl: number; refreshTtl: number }): Promise<AuthTokens> {
    const memberships = await this.prisma.membership.findMany({
      where: { userId: user.id, status: 'active' },
      select: { financialSpaceId: true, role: true },
    });

    const basePayload = {
      sub: user.id,
      email: user.email,
      spaceIds: memberships.map((m) => m.financialSpaceId),
      memberships: memberships.map((m) => ({ spaceId: m.financialSpaceId, role: m.role })),
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(basePayload, { expiresIn: config.accessTtl }),
      this.jwtService.signAsync({ sub: user.id, kind: 'refresh' }, { expiresIn: config.refreshTtl }),
    ]);

    return {
      accessToken,
      refreshToken,
      expiresIn: config.accessTtl,
    };
  }

  async refresh(refreshToken: string, config: { accessTtl: number }): Promise<AuthTokens> {
    try {
      const payload = (await this.jwtService.verifyAsync(refreshToken)) as { sub: string; kind?: string };
      if (payload.kind !== 'refresh') throw new UnauthorizedException('Token invalido');
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user) throw new UnauthorizedException('Usuario nao encontrado');
      return this.issueTokens(user, { accessTtl: config.accessTtl, refreshTtl: 60 * 60 * 24 * 14 });
    } catch (e) {
      if (e instanceof UnauthorizedException || e instanceof NotFoundException) throw e;
      throw new UnauthorizedException('Refresh token invalido');
    }
  }
}

import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { AuthDomainService } from '../domain/auth.domain.service';
import { PrismaClient } from '@prisma/client';
import {
  JwtAuthGuard,
  CurrentUser,
  AuthenticatedUser,
  Public,
} from '../../common/auth/auth.guard';
import { AuthResponse, LoginRequest, RefreshTokenRequest, RegisterRequest } from './dto';

@ApiTags('identity')
@Controller('identity')
export class IdentityController {
  constructor(
    private readonly auth: AuthDomainService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaClient,
  ) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Criar conta de usuario' })
  async register(@Body() body: RegisterRequest): Promise<AuthResponse> {
    const user = await this.auth.register(body);

    const defaultSpaceName = body.name ? `Financeiro de ${body.name}` : 'Meu financeiro';
    await this.prisma.financialSpace.create({
      data: {
        name: defaultSpaceName,
        primaryCurrency: 'BRL',
        timezone: user.timezone,
        memberships: { create: { userId: user.id, role: 'owner' } },
      },
    });

    const ttl = {
      accessTtl: this.config.getOrThrow<number>('app.JWT_ACCESS_TTL'),
      refreshTtl: this.config.getOrThrow<number>('app.JWT_REFRESH_TTL'),
    };
    const tokens = await this.auth.issueTokens(user, ttl);
    return { ...tokens, tokenType: 'Bearer', user: this.toUserView(user) };
  }

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Entrar com e-mail e senha' })
  async login(@Body() body: LoginRequest): Promise<AuthResponse> {
    const user = await this.auth.authenticateLocal(body.email, body.password);
    const ttl = {
      accessTtl: this.config.getOrThrow<number>('app.JWT_ACCESS_TTL'),
      refreshTtl: this.config.getOrThrow<number>('app.JWT_REFRESH_TTL'),
    };
    const tokens = await this.auth.issueTokens(user, ttl);
    return { ...tokens, tokenType: 'Bearer', user: this.toUserView(user) };
  }

  @Public()
  @Post('refresh')
  @ApiOperation({ summary: 'Renovar access token' })
  async refresh(@Body() body: RefreshTokenRequest): Promise<AuthResponse> {
    const tokens = await this.auth.refresh(body.refreshToken, {
      accessTtl: this.config.getOrThrow<number>('app.JWT_ACCESS_TTL'),
    });
    return { ...tokens, tokenType: 'Bearer' };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Perfil autenticado' })
  async me(@CurrentUser() user: AuthenticatedUser) {
    const dbUser = await this.prisma.user.findUnique({ where: { id: user.sub } });
    return {
      id: dbUser?.id,
      email: dbUser?.email,
      name: dbUser?.name,
      timezone: dbUser?.timezone,
      locale: dbUser?.locale,
      lastLoginAt: dbUser?.lastLoginAt,
      memberships: user.memberships,
    };
  }

  private toUserView(user: { id: string; email: string; name: string | null; timezone: string; locale: string }) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      timezone: user.timezone,
      locale: user.locale,
    };
  }
}

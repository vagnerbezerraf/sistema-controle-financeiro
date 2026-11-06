import { Body, Controller, Get, HttpCode, Post, Query, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { AuthDomainService } from '../domain/auth.domain.service';
import { MfaService } from '../domain/mfa.service';
import { PasswordResetService } from '../domain/password-reset.service';
import { OidcService, OidcProfile } from '../domain/oidc.service';
import { PrismaClient } from '@prisma/client';
import {
  JwtAuthGuard,
  CurrentUser,
  AuthenticatedUser,
  Public,
} from '../../common/auth/auth.guard';
import {
  AuthResponse,
  ForgotPasswordRequest,
  LoginRequest,
  MfaCodeRequest,
  MfaEnableResponse,
  MfaSetupResponse,
  OidcClientConfigResponse,
  OidcConfigQuery,
  OidcExchangeRequest,
  RefreshTokenRequest,
  RegisterRequest,
  ResetPasswordRequest,
} from './dto';

@ApiTags('identity')
@Controller('identity')
export class IdentityController {
  constructor(
    private readonly auth: AuthDomainService,
    private readonly mfa: MfaService,
    private readonly passwordReset: PasswordResetService,
    private readonly oidc: OidcService,
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
  @ApiOperation({ summary: 'Entrar com e-mail e senha (com segundo fator quando o MFA esta ativo)' })
  async login(@Body() body: LoginRequest): Promise<AuthResponse> {
    const user = await this.auth.authenticateLocal(body.email, body.password);

    if (user.mfaEnabled) {
      if (!body.mfaCode) return { tokenType: 'Bearer', mfaRequired: true };
      const ok = await this.mfa.verifyForLogin(user.id, body.mfaCode);
      if (!ok) throw new UnauthorizedException('Codigo de verificacao invalido');
    }

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

  @Public()
  @Post('password/forgot')
  @HttpCode(202)
  @ApiOperation({ summary: 'Solicitar redefinicao de senha (envia e-mail)' })
  async forgotPassword(@Body() body: ForgotPasswordRequest): Promise<{ ok: true }> {
    await this.passwordReset.request(body.email);
    return { ok: true };
  }

  @Public()
  @Post('password/reset')
  @HttpCode(200)
  @ApiOperation({ summary: 'Redefinir a senha usando o token recebido por e-mail' })
  async resetPassword(@Body() body: ResetPasswordRequest): Promise<{ ok: true }> {
    await this.passwordReset.reset(body.token, body.password);
    return { ok: true };
  }

  @Public()
  @Get('oidc/config')
  @ApiOperation({ summary: 'Metadados OIDC/PKCE para os clientes montarem o redirect' })
  async oidcConfig(@Query() query: OidcConfigQuery): Promise<OidcClientConfigResponse> {
    return this.oidc.getClientConfig(query.client ?? 'web');
  }

  @Public()
  @Post('oidc/exchange')
  @HttpCode(200)
  @ApiOperation({ summary: 'Trocar o code OIDC (PKCE) por tokens do SCF' })
  async oidcExchange(@Body() body: OidcExchangeRequest): Promise<AuthResponse> {
    const profile = await this.oidc.exchangeCode(body.client, body);
    const user = await this.findOrCreateOidcUser(profile);
    const tokens = await this.auth.issueTokens(user, {
      accessTtl: this.config.getOrThrow<number>('app.JWT_ACCESS_TTL'),
      refreshTtl: this.config.getOrThrow<number>('app.JWT_REFRESH_TTL'),
    });
    return { ...tokens, tokenType: 'Bearer', user: this.toUserView(user) };
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
      mfaEnabled: dbUser?.mfaEnabled,
      memberships: user.memberships,
    };
  }

  @Post('mfa/setup')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Iniciar configuracao do MFA (TOTP)' })
  async mfaSetup(@CurrentUser() user: AuthenticatedUser): Promise<MfaSetupResponse> {
    return this.mfa.beginSetup(user.sub);
  }

  @Post('mfa/enable')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Confirmar codigo e ativar o MFA' })
  async mfaEnable(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: MfaCodeRequest,
  ): Promise<MfaEnableResponse> {
    return this.mfa.enable(user.sub, body.code);
  }

  @Post('mfa/disable')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Desativar o MFA (requer um codigo valido)' })
  async mfaDisable(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: MfaCodeRequest,
  ): Promise<{ ok: true }> {
    await this.mfa.disable(user.sub, body.code);
    return { ok: true };
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

  /**
   * Localiza o usuario vinculado ao `sub` do provedor OIDC; se for o primeiro
   * login, tenta vincular a uma conta local existente pelo e-mail ou cria uma
   * nova conta com um espaco financeiro padrao (mesmo comportamento do cadastro).
   */
  private async findOrCreateOidcUser(profile: OidcProfile) {
    let user = await this.prisma.user.findUnique({ where: { oidcSub: profile.sub } });

    if (!user) {
      const existing = await this.prisma.user.findUnique({ where: { email: profile.email } });
      if (existing) {
        user = await this.prisma.user.update({
          where: { id: existing.id },
          data: {
            oidcSub: profile.sub,
            emailVerifiedAt:
              existing.emailVerifiedAt ?? (profile.emailVerified ? new Date() : null),
          },
        });
      }
    }

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email: profile.email,
          name: profile.name ?? undefined,
          oidcSub: profile.sub,
          emailVerifiedAt: profile.emailVerified ? new Date() : null,
        },
      });
      const defaultSpaceName = profile.name ? `Financeiro de ${profile.name}` : 'Meu financeiro';
      await this.prisma.financialSpace.create({
        data: {
          name: defaultSpaceName,
          primaryCurrency: 'BRL',
          timezone: user.timezone,
          memberships: { create: { userId: user.id, role: 'owner' } },
        },
      });
    }

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return user;
  }
}

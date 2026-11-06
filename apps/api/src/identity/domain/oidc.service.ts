import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type OidcClient = 'web' | 'mobile' | 'desktop';

export interface OidcClientConfig {
  enabled: boolean;
  issuer: string;
  clientId: string;
  redirectUri: string;
  scopes: string;
  authorizationEndpoint: string;
  endSessionEndpoint?: string;
}

export interface OidcProfile {
  sub: string;
  email: string;
  name?: string;
  emailVerified: boolean;
}

interface OidcDiscovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  end_session_endpoint?: string;
}

const DISCOVERY_TTL_MS = 10 * 60 * 1000;
const stripSlash = (url: string) => url.replace(/\/+$/, '');

/**
 * Integracao com um provedor OIDC externo (Keycloak no ambiente Docker).
 *
 * O fluxo e Authorization Code + PKCE: os clientes (web/mobile/desktop) fazem o
 * redirect para o provedor e devolvem o `code` para a API, que troca o code por
 * um access token e consulta o `userinfo`. A API entao emite os proprios JWTs,
 * mantendo intacta toda a autorizacao existente (guards, memberships, etc.).
 */
@Injectable()
export class OidcService {
  private readonly logger = new Logger(OidcService.name);
  private discoveryCache: { value: OidcDiscovery; expiresAt: number } | null = null;

  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    return this.publicIssuer.length > 0;
  }

  private get publicIssuer(): string {
    return stripSlash(this.config.get<string>('app.OIDC_ISSUER_URL') ?? '');
  }

  private get internalIssuer(): string {
    const internal = this.config.get<string>('app.OIDC_INTERNAL_ISSUER_URL');
    return stripSlash(internal || this.publicIssuer);
  }

  private get scopes(): string {
    return this.config.get<string>('app.OIDC_SCOPES') ?? 'openid profile email';
  }

  private clientIdFor(client: OidcClient): string {
    if (client === 'mobile') return this.config.get<string>('app.OIDC_CLIENT_ID_MOBILE') ?? 'scf-mobile';
    if (client === 'desktop') return this.config.get<string>('app.OIDC_CLIENT_ID') ?? 'scf-desktop';
    return this.config.get<string>('app.OIDC_CLIENT_ID_WEB') ?? 'scf-web';
  }

  private redirectUriFor(client: OidcClient): string {
    if (client === 'mobile') {
      return this.config.get<string>('app.OIDC_REDIRECT_URI_MOBILE') ?? 'scf-mobile://auth/callback';
    }
    if (client === 'desktop') {
      return this.config.get<string>('app.OIDC_REDIRECT_URI_DESKTOP') ?? 'scf://auth/callback';
    }
    return this.config.get<string>('app.OIDC_REDIRECT_URI_WEB') ?? 'http://localhost:3000/auth/callback';
  }

  /** Metadados consumidos pelos clientes para montar o redirect de autorizacao. */
  async getClientConfig(client: OidcClient): Promise<OidcClientConfig> {
    const base: OidcClientConfig = {
      enabled: this.enabled,
      issuer: this.publicIssuer,
      clientId: this.clientIdFor(client),
      redirectUri: this.redirectUriFor(client),
      scopes: this.scopes,
      authorizationEndpoint: '',
    };
    if (!this.enabled) return base;

    try {
      const discovery = await this.getDiscovery();
      return {
        ...base,
        authorizationEndpoint: this.toPublic(discovery.authorization_endpoint),
        endSessionEndpoint: discovery.end_session_endpoint
          ? this.toPublic(discovery.end_session_endpoint)
          : undefined,
      };
    } catch (err) {
      // Provedor fora do ar: escondemos o SSO em vez de quebrar o login local.
      this.logger.warn(`OIDC indisponivel ao montar config: ${(err as Error).message}`);
      return { ...base, enabled: false };
    }
  }

  /** Troca o `code` por um access token e retorna o perfil do usuario no provedor. */
  async exchangeCode(
    client: OidcClient,
    input: { code: string; codeVerifier: string; redirectUri?: string },
  ): Promise<OidcProfile> {
    if (!this.enabled) throw new BadRequestException('OIDC nao esta habilitado');

    const discovery = await this.getDiscovery();
    const redirectUri = input.redirectUri || this.redirectUriFor(client);

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: input.code,
      redirect_uri: redirectUri,
      client_id: this.clientIdFor(client),
      code_verifier: input.codeVerifier,
    });
    const secret = this.config.get<string>('app.OIDC_CLIENT_SECRET');
    if (secret) {
      body.set('client_secret', secret);
    }

    let tokens: Record<string, unknown>;
    try {
      const res = await fetch(discovery.token_endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
        body: body.toString(),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        this.logger.warn(`Falha na troca de token OIDC (${res.status}): ${detail}`);
        throw new UnauthorizedException('Nao foi possivel validar o login externo');
      }
      tokens = (await res.json()) as Record<string, unknown>;
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      this.logger.error(`Erro ao contatar o provedor OIDC: ${(err as Error).message}`);
      throw new UnauthorizedException('Provedor de identidade indisponivel');
    }

    const accessToken = tokens.access_token as string | undefined;
    if (!accessToken) throw new UnauthorizedException('Resposta do provedor sem access_token');

    const userinfoRes = await fetch(discovery.userinfo_endpoint, {
      headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' },
    });
    if (!userinfoRes.ok) {
      throw new UnauthorizedException('Nao foi possivel ler o perfil do provedor');
    }
    const info = (await userinfoRes.json()) as Record<string, unknown>;

    const sub = info.sub as string | undefined;
    const email = (info.email ?? info.preferred_username) as string | undefined;
    if (!sub || !email) {
      throw new UnauthorizedException('Perfil do provedor sem sub/email');
    }

    return {
      sub,
      email,
      name: (info.name as string | undefined) ?? (info.given_name as string | undefined),
      emailVerified: Boolean(info.email_verified),
    };
  }

  private async getDiscovery(): Promise<OidcDiscovery> {
    if (this.discoveryCache && this.discoveryCache.expiresAt > Date.now()) {
      return this.discoveryCache.value;
    }
    const url = `${this.internalIssuer}/.well-known/openid-configuration`;
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new UnauthorizedException('Provedor OIDC indisponivel (discovery)');
    const value = (await res.json()) as OidcDiscovery;
    this.discoveryCache = { value, expiresAt: Date.now() + DISCOVERY_TTL_MS };
    return value;
  }

  /** Reescreve a URL interna (container) para a URL publica vista pelo navegador. */
  private toPublic(url: string): string {
    const internal = this.internalIssuer;
    if (internal && internal !== this.publicIssuer && url.startsWith(internal)) {
      return this.publicIssuer + url.slice(internal.length);
    }
    return url;
  }
}

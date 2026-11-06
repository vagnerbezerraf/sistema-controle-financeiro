import * as WebBrowser from 'expo-web-browser';
import type { AuthResponse } from '@scf/api-contracts';
import { apiFetch } from './api';
import { randomString, sha256Challenge } from './pkce';

WebBrowser.maybeCompleteAuthSession();

export interface OidcClientConfig {
  enabled: boolean;
  issuer: string;
  clientId: string;
  redirectUri: string;
  scopes: string;
  authorizationEndpoint: string;
  endSessionEndpoint?: string;
}

const DEFAULT_REDIRECT_URI = 'scf-mobile://auth/callback';

/** Monta uma query string sem depender do URLSearchParams (ausente no RN). */
function buildQuery(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

/** Extrai os parametros de query de uma URL de redirect. */
function parseQuery(url: string): Record<string, string> {
  const q = url.includes('?') ? url.slice(url.indexOf('?') + 1) : '';
  const out: Record<string, string> = {};
  for (const pair of q.split('&')) {
    if (!pair) continue;
    const i = pair.indexOf('=');
    const key = decodeURIComponent(pair.slice(0, i));
    const value = decodeURIComponent(pair.slice(i + 1));
    out[key] = value;
  }
  return out;
}

export async function fetchOidcConfig(client: 'web' | 'mobile' | 'desktop' = 'mobile'): Promise<OidcClientConfig> {
  return apiFetch<OidcClientConfig>(`/identity/oidc/config?client=${client}`, { publicEndpoint: true });
}

/**
 * Executa o fluxo Authorization Code + PKCE no app mobile: abre o navegador
 * seguro do sistema no provedor OIDC e, ao voltar para o app (deep link),
 * troca o `code` pelos tokens do SCF.
 */
export async function loginWithOidc(): Promise<AuthResponse> {
  const cfg = await fetchOidcConfig('mobile');
  if (!cfg.enabled || !cfg.authorizationEndpoint) {
    throw new Error('Login SSO indisponivel');
  }

  const redirectUri = cfg.redirectUri || DEFAULT_REDIRECT_URI;
  const verifier = randomString(32);
  const challenge = await sha256Challenge(verifier);
  const state = randomString(16);

  const authUrl =
    `${cfg.authorizationEndpoint}?` +
    buildQuery({
      client_id: cfg.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: cfg.scopes,
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });

  const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);
  if (result.type !== 'success' || !result.url) {
    throw new Error('Login cancelado');
  }

  const params = parseQuery(result.url);
  if (params.state !== state) throw new Error('Estado do login invalido');
  if (!params.code) throw new Error('Codigo de autorizacao ausente');

  return apiFetch<AuthResponse>('/identity/oidc/exchange', {
    method: 'POST',
    json: { client: 'mobile', code: params.code, codeVerifier: verifier, redirectUri },
    publicEndpoint: true,
  });
}

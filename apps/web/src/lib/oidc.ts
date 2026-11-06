import { apiFetch } from './api-client';
import { randomString, sha256Challenge } from './pkce';

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

const VERIFIER_KEY = 'scf.oidc.verifier';
const STATE_KEY = 'scf.oidc.state';
const CLIENT_KEY = 'scf.oidc.client';

export async function fetchOidcConfig(client: OidcClient = 'web'): Promise<OidcClientConfig> {
  return apiFetch<OidcClientConfig>(`/identity/oidc/config?client=${client}`, {
    publicEndpoint: true,
  });
}

/**
 * Inicia o fluxo Authorization Code + PKCE: guarda o `code_verifier`/`state` na
 * sessao e redireciona o navegador para o provedor OIDC.
 */
export async function startOidcLogin(client: OidcClient = 'web'): Promise<void> {
  const cfg = await fetchOidcConfig(client);
  if (!cfg.enabled || !cfg.authorizationEndpoint) {
    throw new Error('Login SSO indisponivel');
  }

  const verifier = randomString(48);
  const challenge = await sha256Challenge(verifier);
  const state = randomString(16);

  sessionStorage.setItem(VERIFIER_KEY, verifier);
  sessionStorage.setItem(STATE_KEY, state);
  sessionStorage.setItem(CLIENT_KEY, client);

  const url = new URL(cfg.authorizationEndpoint);
  url.searchParams.set('client_id', cfg.clientId);
  url.searchParams.set('redirect_uri', cfg.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', cfg.scopes);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');

  window.location.assign(url.toString());
}

/** Recupera os dados temporarios do PKCE gravados antes do redirect. */
export function readPkceSession(): { verifier: string | null; state: string | null; client: OidcClient } {
  return {
    verifier: sessionStorage.getItem(VERIFIER_KEY),
    state: sessionStorage.getItem(STATE_KEY),
    client: (sessionStorage.getItem(CLIENT_KEY) as OidcClient) ?? 'web',
  };
}

export function clearPkceSession(): void {
  sessionStorage.removeItem(VERIFIER_KEY);
  sessionStorage.removeItem(STATE_KEY);
  sessionStorage.removeItem(CLIENT_KEY);
}

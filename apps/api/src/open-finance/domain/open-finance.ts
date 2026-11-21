/**
 * Dominio puro do Open Finance (Fase 5).
 *
 * Um consentimento liga um espaco financeiro a uma instituicao no agregador. O
 * ciclo de vida e dirigido pelo provedor (o usuario autoriza no fluxo hospedado
 * por ele); aqui apenas traduzimos a situacao para o nosso vocabulario,
 * decidimos se o vinculo esta ativo e o que ainda pode ser feito. Nada aqui
 * toca rede nem banco: recebe os dados ja lidos como parametros.
 *
 * Comentarios sem acentos por convencao do projeto.
 */

/** Situacao de um consentimento, do ponto de vista do SCF. */
export type ConsentStatus = 'pending' | 'authorized' | 'rejected' | 'expired' | 'revoked';

/** Instituicao oferecida pelo agregador. */
export interface ProviderInstitution {
  id: string;
  name: string;
  logoUrl?: string | null;
}

/** Consentimento como o provedor o reporta. */
export interface ProviderConsent {
  /** Identificador do consentimento no agregador. */
  externalId: string;
  status: ConsentStatus;
  /** URL que o usuario abre para autorizar (fluxo hospedado pelo provedor). */
  consentUrl: string;
  /** Validade do consentimento (ISO-8601) ou `null` quando sem prazo. */
  expiresAt: string | null;
}

/**
 * Contrato do adaptador de Open Finance. A implementacao real fala com um
 * agregador; nos ambientes sem integracao, o adaptador de desenvolvimento
 * (`StubOpenFinanceProvider`) cumpre o mesmo contrato sem acessar a rede.
 */
export interface OpenFinanceProvider {
  listInstitutions(): Promise<ProviderInstitution[]>;
  createConsent(input: {
    spaceId: string;
    institutionId: string;
    /** Para onde voltar apos a autorizacao no provedor. */
    redirectUrl: string;
  }): Promise<ProviderConsent>;
  getConsent(externalId: string): Promise<ProviderConsent | null>;
  revokeConsent(externalId: string): Promise<void>;
}

/** Situacoes em que o consentimento ja nao muda mais. */
export function isTerminalStatus(status: ConsentStatus): boolean {
  return status === 'rejected' || status === 'expired' || status === 'revoked';
}

/** `true` quando o prazo do consentimento ja passou. */
export function isExpired(expiresAt: string | null, now: Date): boolean {
  if (!expiresAt) return false;
  const time = Date.parse(expiresAt);
  if (Number.isNaN(time)) return false;
  return time <= now.getTime();
}

/**
 * Situacao efetiva na leitura: um consentimento autorizado cujo prazo passou e
 * reportado como `expired` mesmo antes de o provedor avisar.
 */
export function effectiveStatus(
  status: ConsentStatus,
  expiresAt: string | null,
  now: Date,
): ConsentStatus {
  if (status === 'authorized' && isExpired(expiresAt, now)) return 'expired';
  return status;
}

/** `true` quando o consentimento esta autorizado e dentro do prazo. */
export function isConsentActive(
  status: ConsentStatus,
  expiresAt: string | null,
  now: Date,
): boolean {
  return effectiveStatus(status, expiresAt, now) === 'authorized';
}

/** Um consentimento so pode ser revogado enquanto nao estiver em estado terminal. */
export function canRevoke(status: ConsentStatus): boolean {
  return !isTerminalStatus(status);
}

/** Normaliza o vocabulario do provedor para o nosso. */
export function normalizeStatus(raw: string): ConsentStatus {
  switch (raw.trim().toLowerCase()) {
    case 'authorized':
    case 'authorised':
    case 'active':
    case 'updated':
      return 'authorized';
    case 'rejected':
    case 'refused':
    case 'error':
      return 'rejected';
    case 'expired':
      return 'expired';
    case 'revoked':
    case 'deleted':
      return 'revoked';
    default:
      return 'pending';
  }
}

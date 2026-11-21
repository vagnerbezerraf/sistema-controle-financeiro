import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type {
  OpenFinanceProvider,
  ProviderConsent,
  ProviderInstitution,
} from './domain/open-finance';

/** Token de injecao do adaptador de Open Finance. */
export const OPEN_FINANCE_PROVIDER = 'OPEN_FINANCE_PROVIDER';

/** Instituicoes fixas oferecidas pelo adaptador de desenvolvimento. */
const STUB_INSTITUTIONS: ProviderInstitution[] = [
  { id: 'banco-exemplo', name: 'Banco Exemplo' },
  { id: 'banco-digital', name: 'Banco Digital' },
  { id: 'corretora-x', name: 'Corretora X' },
];

/** Validade simulada do consentimento (dias). */
const CONSENT_TTL_DAYS = 90;

/**
 * Adaptador de desenvolvimento/teste: nao fala com nenhum agregador real.
 * Devolve instituicoes fixas; um consentimento nasce `pending` (aguardando a
 * autorizacao do usuario no provedor) e passa a `authorized` na primeira
 * consulta. E o suficiente para exercitar o fluxo ponta a ponta sem rede.
 */
@Injectable()
export class StubOpenFinanceProvider implements OpenFinanceProvider {
  private readonly logger = new Logger(StubOpenFinanceProvider.name);

  async listInstitutions(): Promise<ProviderInstitution[]> {
    return STUB_INSTITUTIONS.map((institution) => ({ ...institution }));
  }

  async createConsent(input: {
    spaceId: string;
    institutionId: string;
    redirectUrl: string;
  }): Promise<ProviderConsent> {
    const externalId = `stub-${randomUUID()}`;
    return {
      externalId,
      status: 'pending',
      consentUrl: `https://open-finance.local/authorize?consent=${externalId}&institution=${input.institutionId}&space=${input.spaceId}`,
      expiresAt: this.inDays(CONSENT_TTL_DAYS),
    };
  }

  async getConsent(externalId: string): Promise<ProviderConsent | null> {
    if (!externalId) return null;
    // Simula a conclusao do fluxo hospedado: o consentimento passa a autorizado.
    return {
      externalId,
      status: 'authorized',
      consentUrl: `https://open-finance.local/authorize?consent=${externalId}`,
      expiresAt: this.inDays(CONSENT_TTL_DAYS),
    };
  }

  async revokeConsent(externalId: string): Promise<void> {
    this.logger.log(`[open-finance:stub] consentimento revogado no provedor: ${externalId}`);
  }

  private inDays(days: number): string {
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  }
}

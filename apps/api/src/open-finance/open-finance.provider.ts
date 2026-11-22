import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type {
  OpenFinanceProvider,
  ProviderConsent,
  ProviderInstitution,
} from './domain/open-finance';
import type { ProviderTransactionPage } from './domain/sync';

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

/** Lancamentos fixos que o adaptador de desenvolvimento entrega, por pagina. */
const STUB_TRANSACTIONS: Array<{ description: string; amount: string; daysAgo: number }> = [
  { description: 'Compra no mercado', amount: '-152.30', daysAgo: 1 },
  { description: 'Salario', amount: '5200.00', daysAgo: 2 },
  { description: 'Assinatura streaming', amount: '-39.90', daysAgo: 3 },
  { description: 'Restaurante', amount: '-88.00', daysAgo: 4 },
  { description: 'Reembolso', amount: '120.00', daysAgo: 5 },
];

/** Tamanho da pagina entregue pelo adaptador de desenvolvimento. */
const STUB_PAGE_SIZE = 2;

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

  /**
   * Lancamentos fixos do adaptador, entregues em paginas de `STUB_PAGE_SIZE`. O
   * `cursor` e o deslocamento na lista; passar o cursor terminal devolve uma
   * pagina vazia, o que exercita o fim da sincronizacao sem mais leituras.
   */
  async fetchTransactions(input: {
    externalId: string;
    cursor?: string | null;
  }): Promise<ProviderTransactionPage> {
    const total = STUB_TRANSACTIONS.length;
    const start = this.cursorToOffset(input.cursor, total);
    const slice = STUB_TRANSACTIONS.slice(start, start + STUB_PAGE_SIZE);
    const next = start + slice.length;
    return {
      transactions: slice.map((item, offset) => ({
        externalId: `${input.externalId}:${start + offset}`,
        postedAt: this.daysAgo(item.daysAgo),
        description: item.description,
        amount: item.amount,
      })),
      nextCursor: String(next),
      hasMore: next < total,
    };
  }

  private cursorToOffset(cursor: string | null | undefined, total: number): number {
    if (!cursor) return 0;
    const parsed = Number(cursor);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return Math.min(parsed, total);
  }

  private inDays(days: number): string {
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  }

  /** Data (`YYYY-MM-DD`) de N dias atras, usada nos lancamentos do stub. */
  private daysAgo(days: number): string {
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  }
}

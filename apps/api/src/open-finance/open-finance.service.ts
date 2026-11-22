import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PrismaClient, type OpenFinanceConsent as ConsentRow } from '@prisma/client';
import type {
  OpenFinanceConsent,
  OpenFinanceInstitution,
  OpenFinanceSyncResult,
} from '@scf/api-contracts';
import {
  canRevoke,
  effectiveStatus,
  isConsentActive,
  isTerminalStatus,
  normalizeStatus,
  type ConsentStatus,
} from './domain/open-finance';
import {
  directionForAmount,
  mergeSyncedIds,
  postingDirectionFor,
  selectNewTransactions,
  signlessAmount,
  type ProviderTransaction,
} from './domain/sync';
import { toDate } from '../common/utils/date';
import { OPEN_FINANCE_PROVIDER } from './open-finance.provider';
import type { OpenFinanceProvider } from './domain/open-finance';
import type {
  CreateOpenFinanceConsentRequest,
  SyncOpenFinanceConsentRequest,
} from './http/dto';

/** Retorno padrao quando o cliente (app nativo/desktop) nao informa a URL. */
const DEFAULT_REDIRECT_URL = 'scf://open-finance/callback';

/** Teto de paginas lidas por sincronizacao, para nao prender a requisicao. */
const MAX_PAGES_PER_SYNC = 10;

/** Converte a linha do banco para a visao publica, com o status efetivo. */
function toView(row: ConsentRow, now: Date): OpenFinanceConsent {
  const expiresAt = row.expiresAt ? row.expiresAt.toISOString() : null;
  return {
    id: row.id,
    financialSpaceId: row.financialSpaceId,
    institutionId: row.institutionId,
    institutionName: row.institutionName,
    status: effectiveStatus(row.status as ConsentStatus, expiresAt, now),
    consentUrl: row.consentUrl,
    expiresAt,
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
    targetAccountId: row.targetAccountId,
    lastSyncedAt: row.lastSyncedAt ? row.lastSyncedAt.toISOString() : null,
    syncedCount: row.syncedExternalIds.length,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    version: row.version,
  };
}

/**
 * Open Finance (Fase 5): consentimento e conexao de instituicoes. O acesso ao
 * agregador fica atras de `OpenFinanceProvider` (injetado); aqui so ha
 * persistencia do vinculo, validacao, auditoria e a traducao do status. A
 * expansao para importacao de lancamentos e uma fatia posterior.
 */
@Injectable()
export class OpenFinanceService {
  constructor(
    private readonly prisma: PrismaClient,
    @Inject(OPEN_FINANCE_PROVIDER) private readonly provider: OpenFinanceProvider,
  ) {}

  /** Instituicoes do provedor, cada uma com o consentimento do espaco (se houver). */
  async listInstitutions(spaceId: string): Promise<OpenFinanceInstitution[]> {
    const [institutions, consents] = await Promise.all([
      this.provider.listInstitutions(),
      this.prisma.openFinanceConsent.findMany({ where: { financialSpaceId: spaceId } }),
    ]);
    const now = new Date();
    const byInstitution = new Map(consents.map((row) => [row.institutionId, row]));
    return institutions.map((institution) => {
      const row = byInstitution.get(institution.id);
      const consent = row ? toView(row, now) : null;
      return {
        id: institution.id,
        name: institution.name,
        logoUrl: institution.logoUrl ?? null,
        consent,
        connected: consent?.status === 'authorized',
      };
    });
  }

  async listConsents(spaceId: string): Promise<OpenFinanceConsent[]> {
    const rows = await this.prisma.openFinanceConsent.findMany({
      where: { financialSpaceId: spaceId },
      orderBy: { createdAt: 'desc' },
    });
    const now = new Date();
    return rows.map((row) => toView(row, now));
  }

  async createConsent(
    spaceId: string,
    body: CreateOpenFinanceConsentRequest,
    userId: string,
  ): Promise<OpenFinanceConsent> {
    const institutions = await this.provider.listInstitutions();
    const institution = institutions.find((item) => item.id === body.institutionId);
    if (!institution) {
      throw new NotFoundException({
        code: 'INSTITUTION_NOT_FOUND',
        message: 'Instituicao nao encontrada no provedor de Open Finance',
      });
    }

    const existing = await this.prisma.openFinanceConsent.findFirst({
      where: { financialSpaceId: spaceId, institutionId: institution.id },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException({
        code: 'CONSENT_ALREADY_EXISTS',
        message: 'Ja existe um consentimento para esta instituicao',
      });
    }

    const providerConsent = await this.provider.createConsent({
      spaceId,
      institutionId: institution.id,
      redirectUrl: body.redirectUrl ?? DEFAULT_REDIRECT_URL,
    });

    const row = await this.prisma.openFinanceConsent.create({
      data: {
        financialSpaceId: spaceId,
        institutionId: institution.id,
        institutionName: institution.name,
        status: providerConsent.status,
        externalId: providerConsent.externalId,
        consentUrl: providerConsent.consentUrl,
        expiresAt: providerConsent.expiresAt ? new Date(providerConsent.expiresAt) : null,
      },
    });

    await this.audit(spaceId, userId, 'openFinanceConsent.create', row.id, {
      institutionId: row.institutionId,
      status: row.status,
    });
    return toView(row, new Date());
  }

  /** Consulta o provedor e atualiza a situacao do consentimento. */
  async refreshConsent(
    spaceId: string,
    consentId: string,
    userId: string,
  ): Promise<OpenFinanceConsent> {
    const existing = await this.loadRow(spaceId, consentId);
    if (isTerminalStatus(existing.status as ConsentStatus) || !existing.externalId) {
      return toView(existing, new Date());
    }

    const remote = await this.provider.getConsent(existing.externalId);
    const row = await this.prisma.openFinanceConsent.update({
      where: { id: existing.id },
      data: remote
        ? {
            status: normalizeStatus(remote.status),
            consentUrl: remote.consentUrl,
            expiresAt: remote.expiresAt ? new Date(remote.expiresAt) : null,
            version: { increment: 1 },
          }
        : { status: 'expired', version: { increment: 1 } },
    });

    await this.audit(spaceId, userId, 'openFinanceConsent.refresh', row.id, {
      status: row.status,
      unknownAtProvider: !remote,
    });
    return toView(row, new Date());
  }

  async revokeConsent(
    spaceId: string,
    consentId: string,
    userId: string,
  ): Promise<OpenFinanceConsent> {
    const existing = await this.loadRow(spaceId, consentId);
    if (!canRevoke(existing.status as ConsentStatus)) {
      throw new ConflictException({
        code: 'CONSENT_NOT_REVOCABLE',
        message: 'Este consentimento nao pode mais ser revogado',
      });
    }

    if (existing.externalId) await this.provider.revokeConsent(existing.externalId);

    const row = await this.prisma.openFinanceConsent.update({
      where: { id: existing.id },
      data: { status: 'revoked', revokedAt: new Date(), version: { increment: 1 } },
    });

    await this.audit(spaceId, userId, 'openFinanceConsent.revoke', row.id, {
      institutionId: row.institutionId,
    });
    return toView(row, new Date());
  }

  /**
   * Sincronizacao incremental: le os lancamentos do agregador em paginas,
   * importa os que ainda nao foram vistos (deduplicando por identificador
   * externo) e grava o cursor e os ids no consentimento, de modo que a proxima
   * chamada continue de onde parou. A rede fica fora da transacao.
   */
  async syncConsent(
    spaceId: string,
    consentId: string,
    body: SyncOpenFinanceConsentRequest,
    userId: string,
  ): Promise<OpenFinanceSyncResult> {
    const existing = await this.loadRow(spaceId, consentId);
    const now = new Date();
    const expiresAt = existing.expiresAt ? existing.expiresAt.toISOString() : null;
    if (!isConsentActive(existing.status as ConsentStatus, expiresAt, now) || !existing.externalId) {
      throw new ConflictException({
        code: 'CONSENT_NOT_ACTIVE',
        message: 'Somente consentimentos autorizados podem sincronizar lancamentos',
      });
    }

    // Conta de destino: a informada agora ou a ultima usada neste consentimento.
    const accountId = body.accountId ?? existing.targetAccountId;
    if (!accountId) {
      throw new BadRequestException({
        code: 'MISSING_TARGET_ACCOUNT',
        message: 'Informe a conta de destino dos lancamentos',
      });
    }
    const account = await this.prisma.account.findFirst({
      where: { id: accountId, financialSpaceId: spaceId },
      select: { id: true, currency: true },
    });
    if (!account) {
      throw new BadRequestException({
        code: 'INVALID_ACCOUNT',
        message: 'Conta nao pertence a este espaco financeiro',
      });
    }

    // Le as paginas primeiro (rede fora da transacao) acumulando apenas o novo.
    const toImport: ProviderTransaction[] = [];
    let cursor = existing.syncCursor;
    let syncedIds = [...existing.syncedExternalIds];
    let skippedCount = 0;
    let hasMore = false;

    for (let page = 0; page < MAX_PAGES_PER_SYNC; page += 1) {
      const result = await this.provider.fetchTransactions({
        externalId: existing.externalId,
        cursor,
      });
      const fresh = selectNewTransactions(syncedIds, result.transactions);
      skippedCount += result.transactions.length - fresh.length;
      toImport.push(...fresh);
      syncedIds = mergeSyncedIds(syncedIds, fresh.map((item) => item.externalId));
      cursor = result.nextCursor;
      hasMore = result.hasMore;
      if (!result.hasMore || !result.nextCursor) break;
    }

    const { row, createdIds } = await this.prisma.$transaction(async (tx) => {
      const ids: string[] = [];
      for (const item of toImport) {
        const type = directionForAmount(item.amount);
        const amount = signlessAmount(item.amount);
        const date = toDate(item.postedAt);
        const created = await tx.transaction.create({
          data: {
            financialSpaceId: spaceId,
            type,
            status: 'confirmed',
            description: item.description,
            currency: account.currency,
            totalAmount: amount,
            effectiveDate: date,
            postings: {
              create: [
                {
                  accountId: account.id,
                  amount,
                  direction: postingDirectionFor(type),
                  effectiveDate: date,
                },
              ],
            },
          },
          select: { id: true },
        });
        ids.push(created.id);
      }

      const consent = await tx.openFinanceConsent.update({
        where: { id: existing.id },
        data: {
          targetAccountId: account.id,
          syncCursor: cursor,
          lastSyncedAt: new Date(),
          syncedExternalIds: syncedIds,
          version: { increment: 1 },
        },
      });

      await tx.auditLog.create({
        data: {
          financialSpaceId: spaceId,
          userId,
          operation: 'openFinanceConsent.sync',
          entityType: 'OpenFinanceConsent',
          entityId: consent.id,
          safeSummary: {
            institutionId: consent.institutionId,
            accountId: account.id,
            importedCount: ids.length,
            skippedCount,
            hasMore,
          },
        },
      });

      return { row: consent, createdIds: ids };
    });

    return {
      consent: toView(row, new Date()),
      importedCount: createdIds.length,
      skippedCount,
      hasMore,
    };
  }

  private async loadRow(spaceId: string, consentId: string): Promise<ConsentRow> {
    const row = await this.prisma.openFinanceConsent.findFirst({
      where: { id: consentId, financialSpaceId: spaceId },
    });
    if (!row) throw new NotFoundException('Consentimento nao encontrado');
    return row;
  }

  private async audit(
    spaceId: string,
    userId: string,
    operation: string,
    entityId: string,
    safeSummary: Prisma.InputJsonValue,
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        financialSpaceId: spaceId,
        userId,
        operation,
        entityType: 'OpenFinanceConsent',
        entityId,
        safeSummary,
      },
    });
  }
}

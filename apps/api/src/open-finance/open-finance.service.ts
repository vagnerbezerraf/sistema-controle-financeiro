import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PrismaClient, type OpenFinanceConsent as ConsentRow } from '@prisma/client';
import type { OpenFinanceConsent, OpenFinanceInstitution } from '@scf/api-contracts';
import {
  canRevoke,
  effectiveStatus,
  isTerminalStatus,
  normalizeStatus,
  type ConsentStatus,
} from './domain/open-finance';
import { OPEN_FINANCE_PROVIDER } from './open-finance.provider';
import type { OpenFinanceProvider } from './domain/open-finance';
import type { CreateOpenFinanceConsentRequest } from './http/dto';

/** Retorno padrao quando o cliente (app nativo/desktop) nao informa a URL. */
const DEFAULT_REDIRECT_URL = 'scf://open-finance/callback';

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

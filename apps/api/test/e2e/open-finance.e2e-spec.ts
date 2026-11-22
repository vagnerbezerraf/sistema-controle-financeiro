import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './utils/app';
import { resetDatabase } from './utils/db';
import { api, auth, bootstrapUser, createAccount } from './utils/factory';

const baseUrl = (spaceId: string) => `/api/v1/financial-spaces/${spaceId}/open-finance`;
const institutionsUrl = (spaceId: string) => `${baseUrl(spaceId)}/institutions`;
const consentsUrl = (spaceId: string) => `${baseUrl(spaceId)}/consents`;

function listInstitutions(app: INestApplication, token: string, spaceId: string) {
  return api(app).get(institutionsUrl(spaceId)).set(auth(token));
}

function listConsents(app: INestApplication, token: string, spaceId: string) {
  return api(app).get(consentsUrl(spaceId)).set(auth(token));
}

function createConsent(
  app: INestApplication,
  token: string,
  spaceId: string,
  body: Record<string, unknown>,
) {
  return api(app).post(consentsUrl(spaceId)).set(auth(token)).send(body);
}

function refreshConsent(app: INestApplication, token: string, spaceId: string, consentId: string) {
  return api(app).post(`${consentsUrl(spaceId)}/${consentId}/refresh`).set(auth(token));
}

function revokeConsent(app: INestApplication, token: string, spaceId: string, consentId: string) {
  return api(app).delete(`${consentsUrl(spaceId)}/${consentId}`).set(auth(token));
}

function syncConsent(
  app: INestApplication,
  token: string,
  spaceId: string,
  consentId: string,
  body: Record<string, unknown> = {},
) {
  return api(app).post(`${consentsUrl(spaceId)}/${consentId}/sync`).set(auth(token)).send(body);
}

describe('E2E | Open Finance (consentimento)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  it('lista instituicoes sem vinculo e cria consentimento com URL de autorizacao', async () => {
    const user = await bootstrapUser(app);

    const instituicoes = await listInstitutions(app, user.accessToken, user.spaceId);
    expect(instituicoes.status).toBe(200);
    expect(instituicoes.body.length).toBeGreaterThan(0);
    expect(instituicoes.body[0]).toMatchObject({ consent: null, connected: false });

    const criado = await createConsent(app, user.accessToken, user.spaceId, {
      institutionId: 'banco-exemplo',
    });
    expect(criado.status).toBe(201);
    expect(criado.body).toMatchObject({
      financialSpaceId: user.spaceId,
      institutionId: 'banco-exemplo',
      institutionName: 'Banco Exemplo',
      status: 'pending',
      revokedAt: null,
      version: 0,
    });
    expect(criado.body.consentUrl).toContain('open-finance.local');
    expect(typeof criado.body.expiresAt).toBe('string');

    const lista = await listConsents(app, user.accessToken, user.spaceId);
    expect(lista.body).toHaveLength(1);
    expect(lista.body[0].id).toBe(criado.body.id);
  });

  it('recusa instituicao inexistente e consentimento duplicado', async () => {
    const user = await bootstrapUser(app);

    const inexistente = await createConsent(app, user.accessToken, user.spaceId, {
      institutionId: 'banco-que-nao-existe',
    });
    expect(inexistente.status).toBe(404);
    expect(inexistente.body.code).toBe('INSTITUTION_NOT_FOUND');

    const criado = await createConsent(app, user.accessToken, user.spaceId, {
      institutionId: 'banco-digital',
    });
    expect(criado.status).toBe(201);

    const duplicado = await createConsent(app, user.accessToken, user.spaceId, {
      institutionId: 'banco-digital',
    });
    expect(duplicado.status).toBe(409);
    expect(duplicado.body.code).toBe('CONSENT_ALREADY_EXISTS');
  });

  it('atualiza para autorizado ao reconsultar o provedor e marca a instituicao como conectada', async () => {
    const user = await bootstrapUser(app);

    const criado = await createConsent(app, user.accessToken, user.spaceId, {
      institutionId: 'corretora-x',
    });
    expect(criado.body.status).toBe('pending');

    const atualizado = await refreshConsent(app, user.accessToken, user.spaceId, criado.body.id);
    expect(atualizado.status).toBe(200);
    expect(atualizado.body.status).toBe('authorized');
    expect(atualizado.body.version).toBe(1);

    const instituicoes = await listInstitutions(app, user.accessToken, user.spaceId);
    const corretora = instituicoes.body.find(
      (item: { id: string }) => item.id === 'corretora-x',
    );
    expect(corretora.connected).toBe(true);
    expect(corretora.consent.status).toBe('authorized');
  });

  it('revoga um consentimento e bloqueia nova revogacao', async () => {
    const user = await bootstrapUser(app);
    const criado = await createConsent(app, user.accessToken, user.spaceId, {
      institutionId: 'banco-exemplo',
    });

    const revogado = await revokeConsent(app, user.accessToken, user.spaceId, criado.body.id);
    expect(revogado.status).toBe(200);
    expect(revogado.body.status).toBe('revoked');
    expect(typeof revogado.body.revokedAt).toBe('string');

    const novamente = await revokeConsent(app, user.accessToken, user.spaceId, criado.body.id);
    expect(novamente.status).toBe(409);
    expect(novamente.body.code).toBe('CONSENT_NOT_REVOCABLE');
  });

  it('recusa refresh e revogacao de consentimento inexistente', async () => {
    const user = await bootstrapUser(app);
    const fantasma = '00000000-0000-0000-0000-000000000000';

    const refresh = await refreshConsent(app, user.accessToken, user.spaceId, fantasma);
    expect(refresh.status).toBe(404);

    const revoke = await revokeConsent(app, user.accessToken, user.spaceId, fantasma);
    expect(revoke.status).toBe(404);
  });

  it('isola os consentimentos por espaco e recusa acesso de outro usuario', async () => {
    const alice = await bootstrapUser(app);
    const bob = await bootstrapUser(app);

    await createConsent(app, alice.accessToken, alice.spaceId, { institutionId: 'banco-exemplo' });

    const doBob = await listConsents(app, bob.accessToken, bob.spaceId);
    expect(doBob.body).toHaveLength(0);

    const acessoIndevido = await listConsents(app, bob.accessToken, alice.spaceId);
    expect(acessoIndevido.status).toBe(403);
  });
});

describe('E2E | Open Finance (sincronizacao incremental)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  /** Cria o consentimento e o autoriza no provedor, devolvendo o id. */
  async function authorizedConsent(
    user: { accessToken: string; spaceId: string },
    institutionId = 'banco-exemplo',
  ): Promise<string> {
    const criado = await createConsent(app, user.accessToken, user.spaceId, { institutionId });
    await refreshConsent(app, user.accessToken, user.spaceId, criado.body.id);
    return criado.body.id as string;
  }

  it('importa os lancamentos do consentimento autorizado na conta escolhida', async () => {
    const user = await bootstrapUser(app);
    const account = await createAccount(app, user.accessToken, user.spaceId);
    const consentId = await authorizedConsent(user);

    const sync = await syncConsent(app, user.accessToken, user.spaceId, consentId, {
      accountId: account.id,
    });
    expect(sync.status).toBe(200);
    expect(sync.body.importedCount).toBe(5);
    expect(sync.body.hasMore).toBe(false);
    expect(sync.body.consent.syncedCount).toBe(5);
    expect(sync.body.consent.targetAccountId).toBe(account.id);
    expect(typeof sync.body.consent.lastSyncedAt).toBe('string');

    expect(await prisma.transaction.count({ where: { financialSpaceId: user.spaceId } })).toBe(5);

    const despesa = await prisma.transaction.findFirst({
      where: { financialSpaceId: user.spaceId, description: 'Compra no mercado' },
      select: { type: true, totalAmount: true, status: true },
    });
    expect(despesa?.type).toBe('expense');
    expect(despesa?.totalAmount.toFixed(2)).toBe('152.30');
    expect(despesa?.status).toBe('confirmed');
  });

  it('e idempotente: nova sincronizacao nao reimporta os mesmos lancamentos', async () => {
    const user = await bootstrapUser(app);
    const account = await createAccount(app, user.accessToken, user.spaceId);
    const consentId = await authorizedConsent(user);

    const primeiro = await syncConsent(app, user.accessToken, user.spaceId, consentId, {
      accountId: account.id,
    });
    expect(primeiro.body.importedCount).toBe(5);

    const segundo = await syncConsent(app, user.accessToken, user.spaceId, consentId, {
      accountId: account.id,
    });
    expect(segundo.status).toBe(200);
    expect(segundo.body.importedCount).toBe(0);
    expect(segundo.body.consent.syncedCount).toBe(5);

    expect(await prisma.transaction.count({ where: { financialSpaceId: user.spaceId } })).toBe(5);
  });

  it('reaproveita a conta alvo gravada quando o corpo nao informa outra', async () => {
    const user = await bootstrapUser(app);
    const account = await createAccount(app, user.accessToken, user.spaceId);
    const consentId = await authorizedConsent(user);

    await syncConsent(app, user.accessToken, user.spaceId, consentId, { accountId: account.id });
    const segundo = await syncConsent(app, user.accessToken, user.spaceId, consentId);
    expect(segundo.status).toBe(200);
    expect(segundo.body.consent.targetAccountId).toBe(account.id);
  });

  it('exige consentimento autorizado e conta de destino valida', async () => {
    const user = await bootstrapUser(app);
    const account = await createAccount(app, user.accessToken, user.spaceId);

    const pendente = await createConsent(app, user.accessToken, user.spaceId, {
      institutionId: 'banco-exemplo',
    });
    const semAutorizacao = await syncConsent(app, user.accessToken, user.spaceId, pendente.body.id, {
      accountId: account.id,
    });
    expect(semAutorizacao.status).toBe(409);
    expect(semAutorizacao.body.code).toBe('CONSENT_NOT_ACTIVE');

    const consentId = await authorizedConsent(user, 'banco-digital');
    const semConta = await syncConsent(app, user.accessToken, user.spaceId, consentId);
    expect(semConta.status).toBe(400);
    expect(semConta.body.code).toBe('MISSING_TARGET_ACCOUNT');

    const contaInvalida = await syncConsent(app, user.accessToken, user.spaceId, consentId, {
      accountId: '00000000-0000-0000-0000-000000000000',
    });
    expect(contaInvalida.status).toBe(400);
    expect(contaInvalida.body.code).toBe('INVALID_ACCOUNT');
  });

  it('bloqueia sincronizacao de consentimento revogado', async () => {
    const user = await bootstrapUser(app);
    const account = await createAccount(app, user.accessToken, user.spaceId);
    const consentId = await authorizedConsent(user);
    await revokeConsent(app, user.accessToken, user.spaceId, consentId);

    const sync = await syncConsent(app, user.accessToken, user.spaceId, consentId, {
      accountId: account.id,
    });
    expect(sync.status).toBe(409);
    expect(sync.body.code).toBe('CONSENT_NOT_ACTIVE');
  });

  it('isola a sincronizacao por espaco e recusa acesso de outro usuario', async () => {
    const alice = await bootstrapUser(app);
    const bob = await bootstrapUser(app);
    const account = await createAccount(app, alice.accessToken, alice.spaceId);
    const consentId = await authorizedConsent(alice);

    const doBob = await syncConsent(app, bob.accessToken, alice.spaceId, consentId, {
      accountId: account.id,
    });
    expect(doBob.status).toBe(403);
  });
});

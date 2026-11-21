import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './utils/app';
import { resetDatabase } from './utils/db';
import { api, auth, bootstrapUser } from './utils/factory';

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

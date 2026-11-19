import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './utils/app';
import { resetDatabase } from './utils/db';
import { api, auth, bootstrapUser, registerUser } from './utils/factory';

describe('E2E | Espaços financeiros e membros', () => {
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

  it('cria um novo espaço financeiro e passa a listá-lo junto do espaço padrão', async () => {
    const user = await bootstrapUser(app);

    const created = await api(app)
      .post('/api/v1/financial-spaces')
      .set(auth(user.accessToken))
      .send({ name: 'Financeiro família', primaryCurrency: 'BRL' });

    expect(created.status).toBe(201);
    expect(created.body.name).toBe('Financeiro família');

    const list = await api(app)
      .get('/api/v1/financial-spaces')
      .set(auth(user.accessToken));

    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(2);
    // Ordenado por createdAt desc: o recém-criado vem primeiro.
    expect(list.body[0].id).toBe(created.body.id);
    expect(list.body.every((s: { userRole: string }) => s.userRole === 'owner')).toBe(true);
  });

  it('consulta e atualiza os dados do espaço financeiro', async () => {
    const user = await bootstrapUser(app);

    const detail = await api(app)
      .get(`/api/v1/financial-spaces/${user.spaceId}`)
      .set(auth(user.accessToken));
    expect(detail.status).toBe(200);
    expect(detail.body.id).toBe(user.spaceId);

    const updated = await api(app)
      .patch(`/api/v1/financial-spaces/${user.spaceId}`)
      .set(auth(user.accessToken))
      .send({ name: 'Renomeado', primaryCurrency: 'USD' });
    expect(updated.status).toBe(200);
    expect(updated.body.name).toBe('Renomeado');
    expect(updated.body.primaryCurrency).toBe('USD');

    const naoEncontrado = await api(app)
      .get('/api/v1/financial-spaces/00000000-0000-0000-0000-000000000000')
      .set(auth(user.accessToken));
    expect(naoEncontrado.status).toBe(403);
  });

  it('aplica concorrência otimista no espaço financeiro (409 STALE_VERSION)', async () => {
    const user = await bootstrapUser(app);
    const url = `/api/v1/financial-spaces/${user.spaceId}`;

    const detalhe = await api(app).get(url).set(auth(user.accessToken));
    expect(detalhe.body.version).toBe(0);

    const atualizado = await api(app)
      .patch(url)
      .set(auth(user.accessToken))
      .send({ name: 'Renomeado', version: 0 });
    expect(atualizado.status).toBe(200);
    expect(atualizado.body.version).toBe(1);

    const desatualizado = await api(app)
      .patch(url)
      .set(auth(user.accessToken))
      .send({ name: 'Escrita perdida', version: 0 });
    expect(desatualizado.status).toBe(409);
    expect(desatualizado.body.code).toBe('STALE_VERSION');
  });

  it('isola os espaços entre usuários: acesso cruzado retorna 403', async () => {
    const dono = await bootstrapUser(app);
    const outro = await bootstrapUser(app);

    const listDoOutro = await api(app)
      .get('/api/v1/financial-spaces')
      .set(auth(outro.accessToken));
    expect(listDoOutro.status).toBe(200);
    expect(listDoOutro.body.map((s: { id: string }) => s.id)).not.toContain(dono.spaceId);

    const acessoCruzado = await api(app)
      .get(`/api/v1/financial-spaces/${dono.spaceId}`)
      .set(auth(outro.accessToken));
    expect(acessoCruzado.status).toBe(403);

    const tentativaDeEdicao = await api(app)
      .patch(`/api/v1/financial-spaces/${dono.spaceId}`)
      .set(auth(outro.accessToken))
      .send({ name: 'Invadido' });
    expect(tentativaDeEdicao.status).toBe(403);
  });

  it('libera a leitura do espaço a um convidado que aceitou o convite', async () => {
    const dono = await bootstrapUser(app);
    const convidado = await registerUser(app);

    const convite = await api(app)
      .post(`/api/v1/financial-spaces/${dono.spaceId}/invites`)
      .set(auth(dono.accessToken))
      .send({ email: convidado.email, role: 'contributor' });
    expect(convite.status).toBe(201);

    const aceite = await api(app)
      .post('/api/v1/space-invites/accept')
      .set(auth(convidado.accessToken))
      .send({ token: convite.body.token });
    expect(aceite.status).toBe(201);

    // O novo membro passa a enxergar o espaço compartilhado.
    const acessoDoConvidado = await api(app)
      .get(`/api/v1/financial-spaces/${dono.spaceId}`)
      .set(auth(convidado.accessToken));
    expect(acessoDoConvidado.status).toBe(200);
  });

  it('bloqueia a edição para papéis sem permissão, mantendo a leitura', async () => {
    const dono = await bootstrapUser(app);
    const convidado = await registerUser(app);

    const convite = await api(app)
      .post(`/api/v1/financial-spaces/${dono.spaceId}/invites`)
      .set(auth(dono.accessToken))
      .send({ email: convidado.email, role: 'viewer' });
    await api(app)
      .post('/api/v1/space-invites/accept')
      .set(auth(convidado.accessToken))
      .send({ token: convite.body.token })
      .expect(201);

    const edicaoComoViewer = await api(app)
      .patch(`/api/v1/financial-spaces/${dono.spaceId}`)
      .set(auth(convidado.accessToken))
      .send({ name: 'Tentativa' });
    expect(edicaoComoViewer.status).toBe(403);

    // Leitura continua permitida para viewer.
    const leitura = await api(app)
      .get(`/api/v1/financial-spaces/${dono.spaceId}`)
      .set(auth(convidado.accessToken));
    expect(leitura.status).toBe(200);
  });
});

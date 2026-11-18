import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './utils/app';
import { resetDatabase } from './utils/db';
import { api, auth, bootstrapUser, createAccount } from './utils/factory';

describe('E2E | Contas', () => {
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

  it('cria uma conta e registra um ajuste de saldo inicial', async () => {
    const user = await bootstrapUser(app);

    const res = await api(app)
      .post(`/api/v1/financial-spaces/${user.spaceId}/accounts`)
      .set(auth(user.accessToken))
      .send({
        name: 'Conta corrente Itaú',
        type: 'checking',
        initialBalance: '1500.00',
        initialBalanceDate: '2026-03-01',
        institution: 'Itaú',
      });

    expect(res.status).toBe(201);
    expect(Number(res.body.initialBalance)).toBe(1500);

    const transacoes = await prisma.transaction.findMany({
      where: { financialSpaceId: user.spaceId },
      include: { postings: true },
    });
    expect(transacoes).toHaveLength(1);
    expect(transacoes[0].type).toBe('adjustment');
    expect(transacoes[0].description).toBe('Saldo inicial - Conta corrente Itaú');
    expect(Number(transacoes[0].totalAmount)).toBe(1500);
    // Saldo positivo entra como débito na conta (aumenta o ativo).
    expect(transacoes[0].postings[0].direction).toBe('debit');
  });

  it('não cria ajuste quando o saldo inicial é zero ou ausente', async () => {
    const user = await bootstrapUser(app);

    await createAccount(app, user.accessToken, user.spaceId, { name: 'Sem saldo' });
    await createAccount(app, user.accessToken, user.spaceId, {
      name: 'Zero',
      initialBalance: '0',
    });

    const count = await prisma.transaction.count({ where: { financialSpaceId: user.spaceId } });
    expect(count).toBe(0);
  });

  it('lista, consulta e atualiza contas', async () => {
    const user = await bootstrapUser(app);
    const conta = await createAccount(app, user.accessToken, user.spaceId, {
      name: 'Poupança',
      type: 'savings',
    });

    const lista = await api(app)
      .get(`/api/v1/financial-spaces/${user.spaceId}/accounts`)
      .set(auth(user.accessToken));
    expect(lista.status).toBe(200);
    expect(lista.body).toHaveLength(1);

    const detalhe = await api(app)
      .get(`/api/v1/financial-spaces/${user.spaceId}/accounts/${conta.id}`)
      .set(auth(user.accessToken));
    expect(detalhe.status).toBe(200);
    expect(detalhe.body.type).toBe('savings');

    const atualizada = await api(app)
      .patch(`/api/v1/financial-spaces/${user.spaceId}/accounts/${conta.id}`)
      .set(auth(user.accessToken))
      .send({ name: 'Poupança principal', state: 'archived' });
    expect(atualizada.status).toBe(200);
    expect(atualizada.body.name).toBe('Poupança principal');
    expect(atualizada.body.state).toBe('archived');
  });

  it('aplica concorrência otimista: aceita a versão corrente, incrementa e rejeita a desatualizada (409)', async () => {
    const user = await bootstrapUser(app);
    const conta = await createAccount(app, user.accessToken, user.spaceId, { name: 'Corrente' });
    const url = `/api/v1/financial-spaces/${user.spaceId}/accounts/${conta.id}`;

    const detalhe = await api(app).get(url).set(auth(user.accessToken));
    expect(detalhe.body.version).toBe(0);

    const atualizada = await api(app)
      .patch(url)
      .set(auth(user.accessToken))
      .send({ name: 'Corrente nova', version: 0 });
    expect(atualizada.status).toBe(200);
    expect(atualizada.body.name).toBe('Corrente nova');
    expect(atualizada.body.version).toBe(1);

    // Segunda sessão ainda com a versão antiga: conflito, nada é sobrescrito.
    const desatualizada = await api(app)
      .patch(url)
      .set(auth(user.accessToken))
      .send({ name: 'Escrita perdida', version: 0 });
    expect(desatualizada.status).toBe(409);
    expect(desatualizada.body.code).toBe('STALE_VERSION');

    const depois = await api(app).get(url).set(auth(user.accessToken));
    expect(depois.body.name).toBe('Corrente nova');
    expect(depois.body.version).toBe(1);
  });

  it('mantém o PATCH retrocompatível quando a versão não é enviada', async () => {
    const user = await bootstrapUser(app);
    const conta = await createAccount(app, user.accessToken, user.spaceId, { name: 'Legado' });

    const res = await api(app)
      .patch(`/api/v1/financial-spaces/${user.spaceId}/accounts/${conta.id}`)
      .set(auth(user.accessToken))
      .send({ name: 'Sem versão' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Sem versão');
    // Sem versão enviada a checagem é ignorada, mas o contador continua avançando.
    expect(res.body.version).toBe(1);
  });

  it('retorna 404 para conta inexistente no espaço informado', async () => {
    const user = await bootstrapUser(app);

    const res = await api(app)
      .get(`/api/v1/financial-spaces/${user.spaceId}/accounts/00000000-0000-0000-0000-000000000000`)
      .set(auth(user.accessToken));

    expect(res.status).toBe(404);
  });

  it('retorna 404 (e não 409) ao atualizar conta inexistente', async () => {
    const user = await bootstrapUser(app);

    const res = await api(app)
      .patch(`/api/v1/financial-spaces/${user.spaceId}/accounts/00000000-0000-0000-0000-000000000000`)
      .set(auth(user.accessToken))
      .send({ name: 'Fantasma', version: 0 });

    expect(res.status).toBe(404);
  });

  it('rejeita criação em espaço financeiro de outro usuário (403)', async () => {
    const dono = await bootstrapUser(app);
    const outro = await bootstrapUser(app);

    const res = await api(app)
      .post(`/api/v1/financial-spaces/${dono.spaceId}/accounts`)
      .set(auth(outro.accessToken))
      .send({ name: 'Conta intrusa', type: 'checking' });

    expect(res.status).toBe(403);
  });

  it('valida o tipo da conta (400)', async () => {
    const user = await bootstrapUser(app);

    const res = await api(app)
      .post(`/api/v1/financial-spaces/${user.spaceId}/accounts`)
      .set(auth(user.accessToken))
      .send({ name: 'Tipo inválido', type: 'cripto' });

    expect(res.status).toBe(400);
  });
});

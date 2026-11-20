import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './utils/app';
import { resetDatabase } from './utils/db';
import { api, auth, bootstrapUser, createAccount, createTransaction } from './utils/factory';

const ruleUrl = (spaceId: string) => `/api/v1/financial-spaces/${spaceId}/categorization-rules`;
const categoryUrl = (spaceId: string) => `/api/v1/financial-spaces/${spaceId}/categories`;
const transactionUrl = (spaceId: string) => `/api/v1/financial-spaces/${spaceId}/transactions`;
const importUrl = (spaceId: string) => `/api/v1/financial-spaces/${spaceId}/imports`;

const now = new Date();
const year = now.getUTCFullYear();
const month = String(now.getUTCMonth() + 1).padStart(2, '0');
const monthDay = (day: number) => `${year}-${month}-${String(day).padStart(2, '0')}`;

function createRule(app: INestApplication, token: string, spaceId: string, body: Record<string, unknown>) {
  return api(app).post(ruleUrl(spaceId)).set(auth(token)).send(body);
}

function updateRule(
  app: INestApplication,
  token: string,
  spaceId: string,
  ruleId: string,
  body: Record<string, unknown>,
) {
  return api(app).patch(`${ruleUrl(spaceId)}/${ruleId}`).set(auth(token)).send(body);
}

function listRules(app: INestApplication, token: string, spaceId: string, query = '') {
  return api(app).get(`${ruleUrl(spaceId)}${query}`).set(auth(token));
}

function applyRules(app: INestApplication, token: string, spaceId: string, query = '') {
  return api(app).post(`${ruleUrl(spaceId)}/apply${query}`).set(auth(token));
}

function listTransactions(app: INestApplication, token: string, spaceId: string) {
  return api(app).get(transactionUrl(spaceId)).set(auth(token));
}

async function createCategory(
  app: INestApplication,
  token: string,
  spaceId: string,
  name: string,
  type: 'income' | 'expense' | 'both' = 'expense',
): Promise<string> {
  const res = await api(app).post(categoryUrl(spaceId)).set(auth(token)).send({ name, type });
  if (res.status !== 201) {
    throw new Error(`Falha ao criar categoria (HTTP ${res.status}): ${JSON.stringify(res.body)}`);
  }
  return res.body.id as string;
}

describe('E2E | Regras de categorizacao', () => {
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

  it('cria, lista por precedencia e atualiza a regra', async () => {
    const user = await bootstrapUser(app);
    const alimentacao = await createCategory(app, user.accessToken, user.spaceId, 'Alimentacao');
    const transporte = await createCategory(app, user.accessToken, user.spaceId, 'Transporte');

    const segunda = await createRule(app, user.accessToken, user.spaceId, {
      name: 'Transporte por app',
      matchType: 'contains',
      pattern: 'uber',
      categoryId: transporte,
      priority: 200,
    });
    expect(segunda.status).toBe(201);
    expect(segunda.body).toMatchObject({
      name: 'Transporte por app',
      matchType: 'contains',
      pattern: 'uber',
      categoryId: transporte,
      categoryName: 'Transporte',
      type: null,
      priority: 200,
      state: 'active',
      version: 0,
    });

    const primeira = await createRule(app, user.accessToken, user.spaceId, {
      name: 'Mercado',
      matchType: 'contains',
      pattern: 'mercado',
      categoryId: alimentacao,
      type: 'expense',
      priority: 10,
    });
    expect(primeira.status).toBe(201);
    expect(primeira.body.type).toBe('expense');

    const listadas = await listRules(app, user.accessToken, user.spaceId);
    expect(listadas.status).toBe(200);
    expect(listadas.body.map((rule: { name: string }) => rule.name)).toEqual([
      'Mercado',
      'Transporte por app',
    ]);

    const atualizada = await updateRule(app, user.accessToken, user.spaceId, primeira.body.id, {
      pattern: 'supermercado',
      type: null,
      state: 'archived',
      version: primeira.body.version,
    });
    expect(atualizada.status).toBe(200);
    expect(atualizada.body.pattern).toBe('supermercado');
    expect(atualizada.body.type).toBeNull();
    expect(atualizada.body.state).toBe('archived');
    expect(atualizada.body.version).toBe(1);

    const apenasAtivas = await listRules(app, user.accessToken, user.spaceId, '?state=active');
    expect(apenasAtivas.body.map((rule: { name: string }) => rule.name)).toEqual([
      'Transporte por app',
    ]);

    const removida = await api(app)
      .delete(`${ruleUrl(user.spaceId)}/${segunda.body.id}`)
      .set(auth(user.accessToken));
    expect(removida.status).toBe(200);
    expect(removida.body).toEqual({ deleted: true });

    const restantes = await listRules(app, user.accessToken, user.spaceId);
    expect(restantes.body).toHaveLength(1);
  });

  it('valida padrao, categoria alvo, regra inexistente e concorrencia otimista', async () => {
    const user = await bootstrapUser(app);
    const categoria = await createCategory(app, user.accessToken, user.spaceId, 'Lazer');

    const padraoVazio = await createRule(app, user.accessToken, user.spaceId, {
      name: 'Invalida',
      matchType: 'contains',
      pattern: '   ',
      categoryId: categoria,
    });
    expect(padraoVazio.status).toBe(400);
    expect(padraoVazio.body.code).toBe('INVALID_RULE_PATTERN');

    const categoriaInexistente = await createRule(app, user.accessToken, user.spaceId, {
      name: 'Sem categoria',
      matchType: 'contains',
      pattern: 'cinema',
      categoryId: '00000000-0000-0000-0000-000000000000',
    });
    expect(categoriaInexistente.status).toBe(400);
    expect(categoriaInexistente.body.code).toBe('INVALID_CATEGORY');

    const valida = await createRule(app, user.accessToken, user.spaceId, {
      name: 'Cinema',
      matchType: 'contains',
      pattern: 'cinema',
      categoryId: categoria,
    });
    expect(valida.status).toBe(201);

    // Primeira alteracao avanca a versao; a segunda usa a versao obsoleta.
    const primeiraAlteracao = await updateRule(app, user.accessToken, user.spaceId, valida.body.id, {
      name: 'Cinema e teatro',
      version: valida.body.version,
    });
    expect(primeiraAlteracao.status).toBe(200);
    expect(primeiraAlteracao.body.version).toBe(1);

    const obsoleta = await updateRule(app, user.accessToken, user.spaceId, valida.body.id, {
      name: 'Nome antigo',
      version: 0,
    });
    expect(obsoleta.status).toBe(409);
    expect(obsoleta.body.code).toBe('STALE_VERSION');

    const inexistente = await updateRule(
      app,
      user.accessToken,
      user.spaceId,
      '00000000-0000-0000-0000-000000000000',
      { name: 'Nada' },
    );
    expect(inexistente.status).toBe(404);
  });

  it('aplica as regras retroativamente apenas aos lancamentos sem categoria', async () => {
    const user = await bootstrapUser(app);
    const conta = await createAccount(app, user.accessToken, user.spaceId, { name: 'Corrente' });
    const alimentacao = await createCategory(app, user.accessToken, user.spaceId, 'Alimentacao');
    const lazer = await createCategory(app, user.accessToken, user.spaceId, 'Lazer');

    await createTransaction(app, user.accessToken, user.spaceId, {
      type: 'expense',
      description: 'Mercado do bairro',
      totalAmount: '120.00',
      effectiveDate: monthDay(10),
      postings: [{ accountId: conta.id, amount: '120.00', direction: 'credit' }],
    });
    await createTransaction(app, user.accessToken, user.spaceId, {
      type: 'expense',
      description: 'Padaria',
      totalAmount: '30.00',
      effectiveDate: monthDay(11),
      postings: [{ accountId: conta.id, amount: '30.00', direction: 'credit' }],
    });
    // Ja categorizada: nao deve ser tocada nem contabilizada.
    await createTransaction(app, user.accessToken, user.spaceId, {
      type: 'expense',
      description: 'Mercado pago em dinheiro',
      totalAmount: '50.00',
      effectiveDate: monthDay(12),
      categoryId: lazer,
      postings: [{ accountId: conta.id, amount: '50.00', direction: 'credit' }],
    });

    await createRule(app, user.accessToken, user.spaceId, {
      name: 'Mercado',
      matchType: 'contains',
      pattern: 'mercado',
      categoryId: alimentacao,
      type: 'expense',
    });

    const aplicado = await applyRules(app, user.accessToken, user.spaceId);
    expect(aplicado.status).toBe(201);
    expect(aplicado.body).toEqual({ scanned: 2, applied: 1 });

    const transacoes = await listTransactions(app, user.accessToken, user.spaceId);
    const porDescricao = new Map<string, string | null>(
      transacoes.body.items.map((item: { description: string; categoryId: string | null }) => [
        item.description,
        item.categoryId,
      ]),
    );
    expect(porDescricao.get('Mercado do bairro')).toBe(alimentacao);
    expect(porDescricao.get('Padaria')).toBeNull();
    expect(porDescricao.get('Mercado pago em dinheiro')).toBe(lazer);

    // Rodar de novo nao categoriza o que sobrou: so a "Padaria" segue sem match.
    const repetido = await applyRules(app, user.accessToken, user.spaceId);
    expect(repetido.body).toEqual({ scanned: 1, applied: 0 });
  });

  it('respeita a janela de datas na aplicacao retroativa', async () => {
    const user = await bootstrapUser(app);
    const conta = await createAccount(app, user.accessToken, user.spaceId, { name: 'Corrente' });
    const servicos = await createCategory(app, user.accessToken, user.spaceId, 'Servicos');

    await createTransaction(app, user.accessToken, user.spaceId, {
      type: 'expense',
      description: 'Internet',
      totalAmount: '100.00',
      effectiveDate: monthDay(5),
      postings: [{ accountId: conta.id, amount: '100.00', direction: 'credit' }],
    });
    await createTransaction(app, user.accessToken, user.spaceId, {
      type: 'expense',
      description: 'Internet',
      totalAmount: '100.00',
      effectiveDate: monthDay(20),
      postings: [{ accountId: conta.id, amount: '100.00', direction: 'credit' }],
    });

    await createRule(app, user.accessToken, user.spaceId, {
      name: 'Internet',
      matchType: 'equals',
      pattern: 'internet',
      categoryId: servicos,
    });

    const aplicado = await applyRules(
      app,
      user.accessToken,
      user.spaceId,
      `?from=${monthDay(1)}&to=${monthDay(10)}`,
    );
    expect(aplicado.body).toEqual({ scanned: 1, applied: 1 });

    const transacoes = await listTransactions(app, user.accessToken, user.spaceId);
    const categorizadas = transacoes.body.items.filter(
      (item: { categoryId: string | null }) => item.categoryId === servicos,
    );
    expect(categorizadas).toHaveLength(1);
    expect(categorizadas[0].effectiveDate.slice(0, 10)).toBe(monthDay(5));
  });

  it('categoriza os lancamentos no commit da importacao', async () => {
    const user = await bootstrapUser(app);
    const conta = await createAccount(app, user.accessToken, user.spaceId, { name: 'Corrente' });
    const alimentacao = await createCategory(app, user.accessToken, user.spaceId, 'Alimentacao');

    await createRule(app, user.accessToken, user.spaceId, {
      name: 'Mercado',
      matchType: 'contains',
      pattern: 'mercado',
      categoryId: alimentacao,
      type: 'expense',
    });

    const csv = ['data;descricao;valor;tipo', `15/06/2026;Mercado;100,00;despesa`].join('\n');
    const previa = await api(app)
      .post(`${importUrl(user.spaceId)}/preview`)
      .set(auth(user.accessToken))
      .send({ csv, accountId: conta.id });
    expect(previa.status).toBe(201);

    const commit = await api(app)
      .post(`${importUrl(user.spaceId)}/${previa.body.batch.id}/commit`)
      .set(auth(user.accessToken));
    expect(commit.status).toBe(201);
    expect(commit.body.importedCount).toBe(1);

    const transacoes = await listTransactions(app, user.accessToken, user.spaceId);
    expect(transacoes.body.items).toHaveLength(1);
    expect(transacoes.body.items[0]).toMatchObject({
      description: 'Mercado',
      categoryId: alimentacao,
    });
  });

  it('recusa categoria de outro espaco e isola as regras por espaco', async () => {
    const alice = await bootstrapUser(app);
    const bob = await bootstrapUser(app);
    const categoriaDoBob = await createCategory(app, bob.accessToken, bob.spaceId, 'Categoria do Bob');

    const cruzado = await createRule(app, alice.accessToken, alice.spaceId, {
      name: 'Cross',
      matchType: 'contains',
      pattern: 'x',
      categoryId: categoriaDoBob,
    });
    expect(cruzado.status).toBe(400);
    expect(cruzado.body.code).toBe('INVALID_CATEGORY');

    const categoriaAlice = await createCategory(app, alice.accessToken, alice.spaceId, 'Da Alice');
    const daAlice = await createRule(app, alice.accessToken, alice.spaceId, {
      name: 'Da Alice',
      matchType: 'contains',
      pattern: 'alice',
      categoryId: categoriaAlice,
    });
    expect(daAlice.status).toBe(201);

    const doBob = await listRules(app, bob.accessToken, bob.spaceId);
    expect(doBob.body).toHaveLength(0);

    const acessoIndevido = await listRules(app, bob.accessToken, alice.spaceId);
    expect(acessoIndevido.status).toBe(403);
  });
});

import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './utils/app';
import { resetDatabase } from './utils/db';
import { api, auth, bootstrapUser, createAccount, createTransaction } from './utils/factory';

const budgetUrl = (spaceId: string) => `/api/v1/financial-spaces/${spaceId}/budgets`;
const categoryUrl = (spaceId: string) => `/api/v1/financial-spaces/${spaceId}/categories`;

const now = new Date();
const year = now.getUTCFullYear();
const month = String(now.getUTCMonth() + 1).padStart(2, '0');
const lastDay = new Date(Date.UTC(year, now.getUTCMonth() + 1, 0)).getUTCDate();
const periodStart = `${year}-${month}-01`;
const periodEnd = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;
const monthDay = (day: number) => `${year}-${month}-${String(day).padStart(2, '0')}`;

function createBudget(app: INestApplication, token: string, spaceId: string, body: Record<string, unknown>) {
  return api(app).post(budgetUrl(spaceId)).set(auth(token)).send(body);
}

function listBudgets(app: INestApplication, token: string, spaceId: string, query = '') {
  return api(app).get(`${budgetUrl(spaceId)}${query}`).set(auth(token));
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

describe('E2E | Orcamentos', () => {
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

  it('cria o orcamento e calcula o consumo realizado da categoria', async () => {
    const user = await bootstrapUser(app);
    const conta = await createAccount(app, user.accessToken, user.spaceId, { name: 'Corrente' });
    const alimentacao = await createCategory(app, user.accessToken, user.spaceId, 'Alimentacao');

    const created = await createBudget(app, user.accessToken, user.spaceId, {
      periodStart,
      periodEnd,
      amountLimit: '1000.00',
      categoryId: alimentacao,
    });
    expect(created.status).toBe(201);
    expect(created.body.categoryId).toBe(alimentacao);
    expect(created.body.category.name).toBe('Alimentacao');

    // Consumo: uma despesa confirmada na categoria.
    await createTransaction(app, user.accessToken, user.spaceId, {
      type: 'expense',
      description: 'Mercado',
      totalAmount: '250.00',
      effectiveDate: monthDay(10),
      categoryId: alimentacao,
      postings: [{ accountId: conta.id, amount: '250.00', direction: 'credit' }],
    });
    // Receita e despesa sem categoria nao entram neste orcamento.
    await createTransaction(app, user.accessToken, user.spaceId, {
      type: 'income',
      description: 'Salario',
      totalAmount: '9000.00',
      effectiveDate: monthDay(5),
      categoryId: alimentacao,
      postings: [{ accountId: conta.id, amount: '9000.00', direction: 'debit' }],
    });
    await createTransaction(app, user.accessToken, user.spaceId, {
      type: 'expense',
      description: 'Sem categoria',
      totalAmount: '80.00',
      effectiveDate: monthDay(12),
      postings: [{ accountId: conta.id, amount: '80.00', direction: 'credit' }],
    });

    const view = await listBudgets(app, user.accessToken, user.spaceId);
    expect(view.status).toBe(200);
    expect(view.body.periodStart).toBe(periodStart);
    expect(view.body.periodEnd).toBe(periodEnd);
    expect(view.body.items).toHaveLength(1);

    const item = view.body.items[0];
    expect(item.amountLimit).toBe('1000.00');
    expect(item.spentAmount).toBe('250.00');
    expect(item.remainingAmount).toBe('750.00');
    expect(item.usagePercent).toBe(25);
    expect(item.status).toBe('ok');
    expect(view.body.totals).toEqual({
      amountLimit: '1000.00',
      spentAmount: '250.00',
      remainingAmount: '750.00',
    });
  });

  it('soma todas as despesas confirmadas quando o orcamento e geral (sem categoria)', async () => {
    const user = await bootstrapUser(app);
    const conta = await createAccount(app, user.accessToken, user.spaceId, { name: 'Corrente' });
    const lazer = await createCategory(app, user.accessToken, user.spaceId, 'Lazer');

    await createBudget(app, user.accessToken, user.spaceId, {
      periodStart,
      periodEnd,
      amountLimit: '500.00',
    });

    await createTransaction(app, user.accessToken, user.spaceId, {
      type: 'expense',
      description: 'Cinema',
      totalAmount: '120.00',
      effectiveDate: monthDay(8),
      categoryId: lazer,
      postings: [{ accountId: conta.id, amount: '120.00', direction: 'credit' }],
    });
    await createTransaction(app, user.accessToken, user.spaceId, {
      type: 'expense',
      description: 'Sem categoria',
      totalAmount: '30.00',
      effectiveDate: monthDay(9),
      postings: [{ accountId: conta.id, amount: '30.00', direction: 'credit' }],
    });

    const view = await listBudgets(app, user.accessToken, user.spaceId);
    expect(view.body.items).toHaveLength(1);
    expect(view.body.items[0].categoryId).toBeNull();
    expect(view.body.items[0].spentAmount).toBe('150.00');
    expect(view.body.items[0].status).toBe('ok');
  });

  it('sinaliza atencao e estouro conforme o consumo passa do limite', async () => {
    const user = await bootstrapUser(app);
    const conta = await createAccount(app, user.accessToken, user.spaceId, { name: 'Corrente' });
    const transporte = await createCategory(app, user.accessToken, user.spaceId, 'Transporte');

    await createBudget(app, user.accessToken, user.spaceId, {
      periodStart,
      periodEnd,
      amountLimit: '100.00',
      categoryId: transporte,
    });

    await createTransaction(app, user.accessToken, user.spaceId, {
      type: 'expense',
      description: 'Combustivel',
      totalAmount: '85.00',
      effectiveDate: monthDay(7),
      categoryId: transporte,
      postings: [{ accountId: conta.id, amount: '85.00', direction: 'credit' }],
    });

    const emAtencao = await listBudgets(app, user.accessToken, user.spaceId);
    expect(emAtencao.body.items[0].usagePercent).toBe(85);
    expect(emAtencao.body.items[0].status).toBe('warning');

    await createTransaction(app, user.accessToken, user.spaceId, {
      type: 'expense',
      description: 'Estacionamento',
      totalAmount: '40.00',
      effectiveDate: monthDay(11),
      categoryId: transporte,
      postings: [{ accountId: conta.id, amount: '40.00', direction: 'credit' }],
    });

    const estourado = await listBudgets(app, user.accessToken, user.spaceId);
    expect(estourado.body.items[0].spentAmount).toBe('125.00');
    expect(estourado.body.items[0].remainingAmount).toBe('-25.00');
    expect(estourado.body.items[0].usagePercent).toBe(125);
    expect(estourado.body.items[0].status).toBe('exceeded');
  });

  it('atualiza o limite e a categoria, e remove o orcamento', async () => {
    const user = await bootstrapUser(app);
    const moradia = await createCategory(app, user.accessToken, user.spaceId, 'Moradia');
    const servicos = await createCategory(app, user.accessToken, user.spaceId, 'Servicos');

    const created = await createBudget(app, user.accessToken, user.spaceId, {
      periodStart,
      periodEnd,
      amountLimit: '300.00',
      categoryId: moradia,
    });

    const atualizado = await api(app)
      .patch(`${budgetUrl(user.spaceId)}/${created.body.id}`)
      .set(auth(user.accessToken))
      .send({ amountLimit: '450.00', categoryId: servicos });
    expect(atualizado.status).toBe(200);
    expect(atualizado.body.amountLimit).toBe('450');
    expect(atualizado.body.categoryId).toBe(servicos);

    const removido = await api(app)
      .delete(`${budgetUrl(user.spaceId)}/${created.body.id}`)
      .set(auth(user.accessToken));
    expect(removido.status).toBe(200);

    const view = await listBudgets(app, user.accessToken, user.spaceId);
    expect(view.body.items).toHaveLength(0);
  });

  it('valida limite, periodo, categoria alvo e duplicidade', async () => {
    const user = await bootstrapUser(app);
    const categoria = await createCategory(app, user.accessToken, user.spaceId, 'Saude');

    const limiteInvalido = await createBudget(app, user.accessToken, user.spaceId, {
      periodStart,
      periodEnd,
      amountLimit: '0',
    });
    expect(limiteInvalido.status).toBe(400);
    expect(limiteInvalido.body.code).toBe('INVALID_BUDGET_LIMIT');

    const periodoInvalido = await createBudget(app, user.accessToken, user.spaceId, {
      periodStart: periodEnd,
      periodEnd: periodStart,
      amountLimit: '100.00',
    });
    expect(periodoInvalido.status).toBe(400);
    expect(periodoInvalido.body.code).toBe('INVALID_BUDGET_PERIOD');

    const categoriaInexistente = await createBudget(app, user.accessToken, user.spaceId, {
      periodStart,
      periodEnd,
      amountLimit: '100.00',
      categoryId: '00000000-0000-0000-0000-000000000000',
    });
    expect(categoriaInexistente.status).toBe(400);
    expect(categoriaInexistente.body.code).toBe('INVALID_CATEGORY');

    const primeiro = await createBudget(app, user.accessToken, user.spaceId, {
      periodStart,
      periodEnd,
      amountLimit: '100.00',
      categoryId: categoria,
    });
    expect(primeiro.status).toBe(201);

    const duplicado = await createBudget(app, user.accessToken, user.spaceId, {
      periodStart,
      periodEnd,
      amountLimit: '200.00',
      categoryId: categoria,
    });
    expect(duplicado.status).toBe(409);
    expect(duplicado.body.code).toBe('BUDGET_ALREADY_EXISTS');
  });

  it('recusa categoria de outro espaco financeiro e isola os orcamentos', async () => {
    const alice = await bootstrapUser(app);
    const bob = await bootstrapUser(app);
    const categoriaDoBob = await createCategory(app, bob.accessToken, bob.spaceId, 'Categoria do Bob');

    const cruzado = await createBudget(app, alice.accessToken, alice.spaceId, {
      periodStart,
      periodEnd,
      amountLimit: '100.00',
      categoryId: categoriaDoBob,
    });
    expect(cruzado.status).toBe(400);
    expect(cruzado.body.code).toBe('INVALID_CATEGORY');

    const daAlice = await createBudget(app, alice.accessToken, alice.spaceId, {
      periodStart,
      periodEnd,
      amountLimit: '100.00',
    });
    expect(daAlice.status).toBe(201);

    const doBob = await listBudgets(app, bob.accessToken, bob.spaceId);
    expect(doBob.body.items).toHaveLength(0);

    const acessoIndevido = await api(app)
      .get(`${budgetUrl(alice.spaceId)}`)
      .set(auth(bob.accessToken));
    expect(acessoIndevido.status).toBe(403);
  });
});

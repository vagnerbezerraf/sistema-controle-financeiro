import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './utils/app';
import { resetDatabase } from './utils/db';
import {
  api,
  auth,
  bootstrapUser,
  createAccount,
  createTransaction,
  defaultSpaceId,
  registerUser,
} from './utils/factory';

const planningUrl = (spaceId: string) =>
  `/api/v1/financial-spaces/${spaceId}/summary/planning-alerts`;
const budgetUrl = (spaceId: string) => `/api/v1/financial-spaces/${spaceId}/budgets`;
const obligationUrl = (spaceId: string) => `/api/v1/financial-spaces/${spaceId}/obligations`;

const now = new Date();
const year = now.getUTCFullYear();
const month = String(now.getUTCMonth() + 1).padStart(2, '0');
const lastDay = new Date(Date.UTC(year, now.getUTCMonth() + 1, 0)).getUTCDate();
const periodStart = `${year}-${month}-01`;
const periodEnd = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;
const monthDay = (day: number) => `${year}-${month}-${String(day).padStart(2, '0')}`;

/** Dia (UTC) deslocado em N dias a partir de hoje, no formato `YYYY-MM-DD`. */
function isoOffset(days: number): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days))
    .toISOString()
    .slice(0, 10);
}

function createBudget(app: INestApplication, token: string, spaceId: string, body: Record<string, unknown>) {
  return api(app).post(budgetUrl(spaceId)).set(auth(token)).send(body);
}

function createObligation(app: INestApplication, token: string, spaceId: string, body: Record<string, unknown>) {
  return api(app).post(obligationUrl(spaceId)).set(auth(token)).send(body);
}

function getPlanning(app: INestApplication, token: string, spaceId: string, query = '') {
  return api(app).get(`${planningUrl(spaceId)}${query}`).set(auth(token));
}

describe('E2E | Alertas de planejamento', () => {
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

  it('nao gera alertas quando nao ha orcamento em risco nem saldo negativo', async () => {
    const user = await bootstrapUser(app);
    const conta = await createAccount(app, user.accessToken, user.spaceId);

    await createTransaction(app, user.accessToken, user.spaceId, {
      type: 'income',
      description: 'Salario',
      totalAmount: '3000.00',
      effectiveDate: monthDay(1),
      postings: [{ accountId: conta.id, amount: '3000.00', direction: 'debit' }],
    });
    // Orcamento folgado: 25% consumido, sem alerta.
    await createBudget(app, user.accessToken, user.spaceId, {
      periodStart,
      periodEnd,
      amountLimit: '1000.00',
    });
    await createTransaction(app, user.accessToken, user.spaceId, {
      type: 'expense',
      description: 'Mercado',
      totalAmount: '250.00',
      effectiveDate: monthDay(10),
      postings: [{ accountId: conta.id, amount: '250.00', direction: 'credit' }],
    });

    const res = await getPlanning(app, user.accessToken, user.spaceId);
    expect(res.status).toBe(200);
    expect(res.body.today).toBe(isoOffset(0));
    expect(res.body.horizonDays).toBe(30);
    expect(res.body.budgetAlerts).toEqual([]);
    expect(res.body.negativeBalance).toBeNull();
    expect(res.body.counts).toEqual({ budgets: 0, negativeBalance: 0, total: 0 });
  });

  it('sinaliza o orcamento estourado como alerta', async () => {
    const user = await bootstrapUser(app);
    const conta = await createAccount(app, user.accessToken, user.spaceId);

    // Receita folgada: isola o cenario no alerta de orcamento (sem saldo negativo).
    await createTransaction(app, user.accessToken, user.spaceId, {
      type: 'income',
      description: 'Salario',
      totalAmount: '3000.00',
      effectiveDate: monthDay(1),
      postings: [{ accountId: conta.id, amount: '3000.00', direction: 'debit' }],
    });
    await createBudget(app, user.accessToken, user.spaceId, {
      periodStart,
      periodEnd,
      amountLimit: '1000.00',
    });
    await createTransaction(app, user.accessToken, user.spaceId, {
      type: 'expense',
      description: 'Compras',
      totalAmount: '1200.00',
      effectiveDate: monthDay(8),
      postings: [{ accountId: conta.id, amount: '1200.00', direction: 'credit' }],
    });

    const res = await getPlanning(app, user.accessToken, user.spaceId);
    expect(res.status).toBe(200);
    expect(res.body.budgetAlerts).toHaveLength(1);
    expect(res.body.budgetAlerts[0]).toMatchObject({
      categoryId: null,
      amountLimit: '1000.00',
      spentAmount: '1200.00',
      remainingAmount: '-200.00',
      usagePercent: 120,
      status: 'exceeded',
    });
    expect(res.body.counts).toEqual({ budgets: 1, negativeBalance: 0, total: 1 });
  });

  it('sinaliza o orcamento em atencao (>= 80%) como alerta', async () => {
    const user = await bootstrapUser(app);
    const conta = await createAccount(app, user.accessToken, user.spaceId);

    await createBudget(app, user.accessToken, user.spaceId, {
      periodStart,
      periodEnd,
      amountLimit: '100.00',
    });
    await createTransaction(app, user.accessToken, user.spaceId, {
      type: 'expense',
      description: 'Farmacia',
      totalAmount: '85.00',
      effectiveDate: monthDay(6),
      postings: [{ accountId: conta.id, amount: '85.00', direction: 'credit' }],
    });

    const res = await getPlanning(app, user.accessToken, user.spaceId);
    expect(res.body.budgetAlerts).toHaveLength(1);
    expect(res.body.budgetAlerts[0].status).toBe('warning');
    expect(res.body.budgetAlerts[0].usagePercent).toBe(85);
  });

  it('sinaliza o saldo projetado negativo com a menor data', async () => {
    const user = await bootstrapUser(app);

    await createObligation(app, user.accessToken, user.spaceId, {
      type: 'expense',
      description: 'Despesa grande',
      amount: '400.00',
      dueDate: isoOffset(3),
    });

    const res = await getPlanning(app, user.accessToken, user.spaceId);
    expect(res.body.budgetAlerts).toEqual([]);
    expect(res.body.negativeBalance).toEqual({
      minBalance: '-400.00',
      minBalanceDate: isoOffset(3),
    });
    expect(res.body.counts).toEqual({ budgets: 0, negativeBalance: 1, total: 1 });
  });

  it('respeita o horizonte da projecao no alerta de saldo negativo', async () => {
    const user = await bootstrapUser(app);
    await createObligation(app, user.accessToken, user.spaceId, {
      type: 'expense',
      description: 'Despesa distante',
      amount: '400.00',
      dueDate: isoOffset(60),
    });

    const padrao = await getPlanning(app, user.accessToken, user.spaceId);
    expect(padrao.body.negativeBalance).toBeNull();

    const amplo = await getPlanning(app, user.accessToken, user.spaceId, '?horizonDays=90');
    expect(amplo.body.horizonDays).toBe(90);
    expect(amplo.body.negativeBalance).toMatchObject({ minBalance: '-400.00' });
  });

  it('isola os alertas por espaco financeiro', async () => {
    const dono = await bootstrapUser(app);
    await createObligation(app, dono.accessToken, dono.spaceId, {
      type: 'expense',
      description: 'Conta do dono',
      amount: '40.00',
      dueDate: isoOffset(2),
    });

    const outro = await registerUser(app);
    const outroSpace = await defaultSpaceId(app, outro.accessToken);

    const negado = await getPlanning(app, outro.accessToken, dono.spaceId);
    expect(negado.status).toBe(403);

    const proprio = await getPlanning(app, outro.accessToken, outroSpace);
    expect(proprio.status).toBe(200);
    expect(proprio.body.counts).toEqual({ budgets: 0, negativeBalance: 0, total: 0 });
  });
});

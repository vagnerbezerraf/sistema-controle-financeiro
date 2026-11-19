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

const url = (spaceId: string) => `/api/v1/financial-spaces/${spaceId}/summary/monthly-comparison`;

const now = new Date();
const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
const previousDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
const previousMonth = `${previousDate.getUTCFullYear()}-${String(previousDate.getUTCMonth() + 1).padStart(2, '0')}`;
const twoMonthsAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1));
const distantMonth = `${twoMonthsAgo.getUTCFullYear()}-${String(twoMonthsAgo.getUTCMonth() + 1).padStart(2, '0')}`;

const day = (month: string, d: number) => `${month}-${String(d).padStart(2, '0')}`;

function getComparison(app: INestApplication, token: string, spaceId: string, query = '') {
  return api(app).get(`${url(spaceId)}${query}`).set(auth(token));
}

describe('E2E | Comparacoes mensais', () => {
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

  it('compara receitas, despesas e liquido do mes com o anterior', async () => {
    const user = await bootstrapUser(app);
    const conta = await createAccount(app, user.accessToken, user.spaceId);

    // Mes anterior: receita 1000, despesa 600 (liquido 400).
    await createTransaction(app, user.accessToken, user.spaceId, {
      type: 'income',
      description: 'Salario anterior',
      totalAmount: '1000.00',
      effectiveDate: day(previousMonth, 10),
      postings: [{ accountId: conta.id, amount: '1000.00', direction: 'debit' }],
    });
    await createTransaction(app, user.accessToken, user.spaceId, {
      type: 'expense',
      description: 'Despesa anterior',
      totalAmount: '600.00',
      effectiveDate: day(previousMonth, 15),
      postings: [{ accountId: conta.id, amount: '600.00', direction: 'credit' }],
    });

    // Mes corrente: receita 1200, despesa 900 (liquido 300).
    await createTransaction(app, user.accessToken, user.spaceId, {
      type: 'income',
      description: 'Salario atual',
      totalAmount: '1200.00',
      effectiveDate: day(currentMonth, 5),
      postings: [{ accountId: conta.id, amount: '1200.00', direction: 'debit' }],
    });
    await createTransaction(app, user.accessToken, user.spaceId, {
      type: 'expense',
      description: 'Despesa atual',
      totalAmount: '900.00',
      effectiveDate: day(currentMonth, 10),
      postings: [{ accountId: conta.id, amount: '900.00', direction: 'credit' }],
    });

    const res = await getComparison(app, user.accessToken, user.spaceId, `?month=${currentMonth}`);
    expect(res.status).toBe(200);
    expect(res.body.current).toMatchObject({ income: '1200.00', expense: '900.00', net: '300.00' });
    expect(res.body.previous).toMatchObject({ income: '1000.00', expense: '600.00', net: '400.00' });
    expect(res.body.comparison.income).toEqual({
      current: '1200.00',
      previous: '1000.00',
      delta: '200.00',
      deltaPercent: 20,
    });
    expect(res.body.comparison.expense.delta).toBe('300.00');
    expect(res.body.comparison.expense.deltaPercent).toBe(50);
    expect(res.body.comparison.net.delta).toBe('-100.00');
    expect(res.body.comparison.net.deltaPercent).toBe(-25);
  });

  it('ignora canceladas e transacoes fora da janela dos dois meses', async () => {
    const user = await bootstrapUser(app);
    const conta = await createAccount(app, user.accessToken, user.spaceId);

    await createTransaction(app, user.accessToken, user.spaceId, {
      type: 'income',
      description: 'Receita do mes',
      totalAmount: '500.00',
      effectiveDate: day(currentMonth, 6),
      postings: [{ accountId: conta.id, amount: '500.00', direction: 'debit' }],
    });
    const cancelada = await createTransaction(app, user.accessToken, user.spaceId, {
      type: 'expense',
      description: 'Despesa cancelada',
      totalAmount: '999.00',
      effectiveDate: day(currentMonth, 7),
      postings: [{ accountId: conta.id, amount: '999.00', direction: 'credit' }],
    });
    await api(app)
      .delete(`/api/v1/financial-spaces/${user.spaceId}/transactions/${cancelada.body.id}`)
      .set(auth(user.accessToken));
    // Receita de dois meses atras: fora da janela (mes anterior e corrente).
    await createTransaction(app, user.accessToken, user.spaceId, {
      type: 'income',
      description: 'Receita antiga',
      totalAmount: '3000.00',
      effectiveDate: day(distantMonth, 8),
      postings: [{ accountId: conta.id, amount: '3000.00', direction: 'debit' }],
    });

    const res = await getComparison(app, user.accessToken, user.spaceId, `?month=${currentMonth}`);
    expect(res.body.current).toMatchObject({ income: '500.00', expense: '0.00', net: '500.00' });
    expect(res.body.previous).toMatchObject({ income: '0.00', expense: '0.00', net: '0.00' });
  });

  it('usa o mes corrente por padrao e devolve percentual nulo sem base anterior', async () => {
    const user = await bootstrapUser(app);
    const conta = await createAccount(app, user.accessToken, user.spaceId);

    await createTransaction(app, user.accessToken, user.spaceId, {
      type: 'income',
      description: 'Receita do mes',
      totalAmount: '800.00',
      effectiveDate: day(currentMonth, 4),
      postings: [{ accountId: conta.id, amount: '800.00', direction: 'debit' }],
    });

    const res = await getComparison(app, user.accessToken, user.spaceId);
    expect(res.status).toBe(200);
    expect(res.body.current.month).toBe(currentMonth);
    expect(res.body.previous.month).toBe(previousMonth);
    expect(res.body.comparison.income.current).toBe('800.00');
    expect(res.body.comparison.income.delta).toBe('800.00');
    expect(res.body.comparison.income.deltaPercent).toBeNull();
  });

  it('valida o formato do mes informado (400)', async () => {
    const user = await bootstrapUser(app);

    const invalido = await getComparison(app, user.accessToken, user.spaceId, '?month=2026-13');
    expect(invalido.status).toBe(400);
  });

  it('isola as comparacoes por espaco financeiro', async () => {
    const dono = await bootstrapUser(app);
    const conta = await createAccount(app, dono.accessToken, dono.spaceId);
    await createTransaction(app, dono.accessToken, dono.spaceId, {
      type: 'income',
      description: 'Receita do dono',
      totalAmount: '700.00',
      effectiveDate: day(currentMonth, 3),
      postings: [{ accountId: conta.id, amount: '700.00', direction: 'debit' }],
    });

    const outro = await registerUser(app);
    const outroSpace = await defaultSpaceId(app, outro.accessToken);

    const negado = await getComparison(app, outro.accessToken, dono.spaceId, `?month=${currentMonth}`);
    expect(negado.status).toBe(403);

    const proprio = await getComparison(app, outro.accessToken, outroSpace, `?month=${currentMonth}`);
    expect(proprio.status).toBe(200);
    expect(proprio.body.current).toMatchObject({ income: '0.00', expense: '0.00', net: '0.00' });
  });
});

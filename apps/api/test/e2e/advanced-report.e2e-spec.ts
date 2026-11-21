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

const url = (spaceId: string) => `/api/v1/financial-spaces/${spaceId}/summary/advanced-report`;

function getReport(app: INestApplication, token: string, spaceId: string, query = '') {
  return api(app).get(`${url(spaceId)}${query}`).set(auth(token));
}

describe('E2E | Relatorios avancados', () => {
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

  it('reune patrimonio liquido, taxa de poupanca e evolucao mensal', async () => {
    const user = await bootstrapUser(app);
    const conta = await createAccount(app, user.accessToken, user.spaceId, { name: 'Conta' });
    const cartao = await createAccount(app, user.accessToken, user.spaceId, {
      name: 'Cartao',
      type: 'credit_card',
    });

    // Receita 2000 na conta, despesa 1500 na conta e 300 no cartao (divida).
    await createTransaction(app, user.accessToken, user.spaceId, {
      type: 'income',
      description: 'Salario',
      totalAmount: '2000.00',
      effectiveDate: '2026-06-05',
      postings: [{ accountId: conta.id, amount: '2000.00', direction: 'debit' }],
    });
    await createTransaction(app, user.accessToken, user.spaceId, {
      type: 'expense',
      description: 'Despesa na conta',
      totalAmount: '1500.00',
      effectiveDate: '2026-06-10',
      postings: [{ accountId: conta.id, amount: '1500.00', direction: 'credit' }],
    });
    await createTransaction(app, user.accessToken, user.spaceId, {
      type: 'expense',
      description: 'Compra no cartao',
      totalAmount: '300.00',
      effectiveDate: '2026-06-15',
      postings: [{ accountId: cartao.id, amount: '300.00', direction: 'credit' }],
    });

    const res = await getReport(app, user.accessToken, user.spaceId, '?month=2026-06&months=3');
    expect(res.status).toBe(200);

    // Conta 500 (2000 - 1500); cartao -300 (passivo).
    expect(res.body.netWorth).toMatchObject({
      assets: '500.00',
      liabilities: '300.00',
      netWorth: '200.00',
    });
    expect(res.body.netWorth.accounts).toHaveLength(2);
    expect(res.body.netWorth.accounts[1]).toMatchObject({
      accountId: cartao.id,
      type: 'credit_card',
      balance: '-300.00',
    });

    // Sobrou 200 sobre 2000 de receita (despesas 1800).
    expect(res.body.savings).toEqual({
      month: '2026-06',
      income: '2000.00',
      expense: '1800.00',
      saved: '200.00',
      rate: 10,
    });

    // Serie de tres meses terminando na competencia, com os meses vazios zerados.
    expect(res.body.evolution).toEqual([
      { month: '2026-04', income: '0.00', expense: '0.00', net: '0.00' },
      { month: '2026-05', income: '0.00', expense: '0.00', net: '0.00' },
      { month: '2026-06', income: '2000.00', expense: '1800.00', net: '200.00' },
    ]);
  });

  it('ignora canceladas no patrimonio e na serie e usa o mes corrente por padrao', async () => {
    const user = await bootstrapUser(app);
    const conta = await createAccount(app, user.accessToken, user.spaceId);
    const now = new Date();
    const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

    await createTransaction(app, user.accessToken, user.spaceId, {
      type: 'income',
      description: 'Receita valida',
      totalAmount: '800.00',
      effectiveDate: `${currentMonth}-04`,
      postings: [{ accountId: conta.id, amount: '800.00', direction: 'debit' }],
    });
    const cancelada = await createTransaction(app, user.accessToken, user.spaceId, {
      type: 'expense',
      description: 'Despesa cancelada',
      totalAmount: '999.00',
      effectiveDate: `${currentMonth}-06`,
      postings: [{ accountId: conta.id, amount: '999.00', direction: 'credit' }],
    });
    await api(app)
      .delete(`/api/v1/financial-spaces/${user.spaceId}/transactions/${cancelada.body.id}`)
      .set(auth(user.accessToken));

    const res = await getReport(app, user.accessToken, user.spaceId);
    expect(res.status).toBe(200);
    expect(res.body.month).toBe(currentMonth);
    // A cancelada nao entra: saldo 800 e serie zerada de 6 meses.
    expect(res.body.netWorth).toMatchObject({ assets: '800.00', liabilities: '0.00', netWorth: '800.00' });
    expect(res.body.savings).toMatchObject({ income: '800.00', expense: '0.00', saved: '800.00', rate: 100 });
    expect(res.body.evolution).toHaveLength(6);
    expect(res.body.evolution.at(-1)).toMatchObject({ month: currentMonth, income: '800.00', net: '800.00' });
  });

  it('devolve zeros e taxa nula em um espaco sem movimento', async () => {
    const user = await bootstrapUser(app);

    const res = await getReport(app, user.accessToken, user.spaceId, '?month=2026-06&months=2');
    expect(res.status).toBe(200);
    expect(res.body.netWorth).toEqual({
      assets: '0.00',
      liabilities: '0.00',
      netWorth: '0.00',
      currency: 'BRL',
      accounts: [],
    });
    expect(res.body.savings).toEqual({
      month: '2026-06',
      income: '0.00',
      expense: '0.00',
      saved: '0.00',
      rate: null,
    });
    expect(res.body.evolution).toEqual([
      { month: '2026-05', income: '0.00', expense: '0.00', net: '0.00' },
      { month: '2026-06', income: '0.00', expense: '0.00', net: '0.00' },
    ]);
  });

  it('valida o formato do mes e os limites de meses (400)', async () => {
    const user = await bootstrapUser(app);

    const mesInvalido = await getReport(app, user.accessToken, user.spaceId, '?month=2026-13');
    expect(mesInvalido.status).toBe(400);

    const mesesZero = await getReport(app, user.accessToken, user.spaceId, '?months=0');
    expect(mesesZero.status).toBe(400);

    const mesesAcima = await getReport(app, user.accessToken, user.spaceId, '?months=99');
    expect(mesesAcima.status).toBe(400);
  });

  it('isola os relatorios por espaco financeiro', async () => {
    const dono = await bootstrapUser(app);
    const conta = await createAccount(app, dono.accessToken, dono.spaceId);
    await createTransaction(app, dono.accessToken, dono.spaceId, {
      type: 'income',
      description: 'Receita do dono',
      totalAmount: '700.00',
      effectiveDate: '2026-06-03',
      postings: [{ accountId: conta.id, amount: '700.00', direction: 'debit' }],
    });

    const outro = await registerUser(app);
    const outroSpace = await defaultSpaceId(app, outro.accessToken);

    const negado = await getReport(app, outro.accessToken, dono.spaceId, '?month=2026-06');
    expect(negado.status).toBe(403);

    const proprio = await getReport(app, outro.accessToken, outroSpace, '?month=2026-06');
    expect(proprio.status).toBe(200);
    expect(proprio.body.netWorth.netWorth).toBe('0.00');
  });
});

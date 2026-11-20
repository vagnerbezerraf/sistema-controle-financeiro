import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './utils/app';
import { resetDatabase } from './utils/db';
import { api, auth, bootstrapUser, createAccount, createTransaction } from './utils/factory';

const rateUrl = (spaceId: string) => `/api/v1/financial-spaces/${spaceId}/exchange-rates`;
const dashboardUrl = (spaceId: string, month: string) =>
  `/api/v1/financial-spaces/${spaceId}/transactions/summary/dashboard?month=${month}`;
const reportUrl = (spaceId: string) => `/api/v1/financial-spaces/${spaceId}/summary/advanced-report`;

const now = new Date();
const year = now.getUTCFullYear();
const month = String(now.getUTCMonth() + 1).padStart(2, '0');
const monthKey = `${year}-${month}`;
const monthDay = (day: number) => `${year}-${month}-${String(day).padStart(2, '0')}`;

function createRate(app: INestApplication, token: string, spaceId: string, body: Record<string, unknown>) {
  return api(app).post(rateUrl(spaceId)).set(auth(token)).send(body);
}

function updateRate(
  app: INestApplication,
  token: string,
  spaceId: string,
  rateId: string,
  body: Record<string, unknown>,
) {
  return api(app).patch(`${rateUrl(spaceId)}/${rateId}`).set(auth(token)).send(body);
}

function listRates(app: INestApplication, token: string, spaceId: string) {
  return api(app).get(rateUrl(spaceId)).set(auth(token));
}

describe('E2E | Taxas de cambio e conversao', () => {
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

  it('cria, lista, atualiza e remove uma taxa com concorrencia otimista', async () => {
    const user = await bootstrapUser(app);

    const criada = await createRate(app, user.accessToken, user.spaceId, {
      fromCurrency: 'USD',
      toCurrency: 'BRL',
      rate: '5.2500',
      asOf: monthDay(1),
      source: 'Banco Central',
    });
    expect(criada.status).toBe(201);
    expect(criada.body).toMatchObject({
      fromCurrency: 'USD',
      toCurrency: 'BRL',
      rate: '5.25',
      asOf: monthDay(1),
      source: 'Banco Central',
      version: 0,
    });

    const listadas = await listRates(app, user.accessToken, user.spaceId);
    expect(listadas.status).toBe(200);
    expect(listadas.body).toHaveLength(1);
    expect(listadas.body[0].id).toBe(criada.body.id);

    const atualizada = await updateRate(app, user.accessToken, user.spaceId, criada.body.id, {
      rate: '5.4000',
      version: criada.body.version,
    });
    expect(atualizada.status).toBe(200);
    expect(atualizada.body.rate).toBe('5.4');
    expect(atualizada.body.version).toBe(1);

    // Versao obsoleta: recusada.
    const obsoleta = await updateRate(app, user.accessToken, user.spaceId, criada.body.id, {
      rate: '9.0000',
      version: 0,
    });
    expect(obsoleta.status).toBe(409);
    expect(obsoleta.body.code).toBe('STALE_VERSION');

    const removida = await api(app)
      .delete(`${rateUrl(user.spaceId)}/${criada.body.id}`)
      .set(auth(user.accessToken));
    expect(removida.status).toBe(200);
    expect(removida.body).toEqual({ deleted: true });

    const restantes = await listRates(app, user.accessToken, user.spaceId);
    expect(restantes.body).toHaveLength(0);
  });

  it('valida par de moedas, taxa invalida, duplicidade e taxa inexistente', async () => {
    const user = await bootstrapUser(app);

    const mesmoPar = await createRate(app, user.accessToken, user.spaceId, {
      fromCurrency: 'BRL',
      toCurrency: 'BRL',
      rate: '1.0000',
    });
    expect(mesmoPar.status).toBe(400);
    expect(mesmoPar.body.code).toBe('INVALID_CURRENCY_PAIR');

    const taxaInvalida = await createRate(app, user.accessToken, user.spaceId, {
      fromCurrency: 'USD',
      toCurrency: 'BRL',
      rate: '0.0000',
    });
    expect(taxaInvalida.status).toBe(400);
    expect(taxaInvalida.body.code).toBe('INVALID_RATE');

    const valida = await createRate(app, user.accessToken, user.spaceId, {
      fromCurrency: 'USD',
      toCurrency: 'BRL',
      rate: '5.0000',
      asOf: monthDay(1),
    });
    expect(valida.status).toBe(201);

    const duplicada = await createRate(app, user.accessToken, user.spaceId, {
      fromCurrency: 'USD',
      toCurrency: 'BRL',
      rate: '5.1000',
      asOf: monthDay(1),
    });
    expect(duplicada.status).toBe(409);
    expect(duplicada.body.code).toBe('DUPLICATE_RATE');

    const inexistente = await updateRate(
      app,
      user.accessToken,
      user.spaceId,
      '00000000-0000-0000-0000-000000000000',
      { rate: '6.0000' },
    );
    expect(inexistente.status).toBe(404);
  });

  it('converte os totais do dashboard pela taxa vigente na data do lancamento', async () => {
    const user = await bootstrapUser(app);
    const contaUsd = await createAccount(app, user.accessToken, user.spaceId, {
      name: 'Conta USD',
      currency: 'USD',
    });

    await createRate(app, user.accessToken, user.spaceId, {
      fromCurrency: 'USD',
      toCurrency: 'BRL',
      rate: '5.0000',
      asOf: monthDay(1),
    });

    await createTransaction(app, user.accessToken, user.spaceId, {
      type: 'expense',
      description: 'Assinatura em dolar',
      totalAmount: '100.00',
      effectiveDate: monthDay(10),
      postings: [{ accountId: contaUsd.id, amount: '100.00', direction: 'credit' }],
    });

    const dashboard = await api(app)
      .get(dashboardUrl(user.spaceId, monthKey))
      .set(auth(user.accessToken));
    expect(dashboard.status).toBe(200);
    expect(dashboard.body.currency).toBe('BRL');
    expect(dashboard.body.totalExpense).toBe('500.00');
    expect(dashboard.body.unconvertedCount).toBe(0);
  });

  it('converte pelo par inverso e conta os lancamentos sem taxa', async () => {
    const user = await bootstrapUser(app);
    const contaUsd = await createAccount(app, user.accessToken, user.spaceId, {
      name: 'Conta USD',
      currency: 'USD',
    });

    // Sem par direto USD->BRL: a conversao usa o inverso de BRL->USD.
    await createRate(app, user.accessToken, user.spaceId, {
      fromCurrency: 'BRL',
      toCurrency: 'USD',
      rate: '0.2000',
      asOf: monthDay(1),
    });

    await createTransaction(app, user.accessToken, user.spaceId, {
      type: 'expense',
      description: 'Gasto em dolar',
      totalAmount: '100.00',
      effectiveDate: monthDay(10),
      postings: [{ accountId: contaUsd.id, amount: '100.00', direction: 'credit' }],
    });

    // EUR sem taxa: fica fora das somas e entra em unconvertedCount.
    await createTransaction(app, user.accessToken, user.spaceId, {
      type: 'expense',
      description: 'Gasto em euro',
      totalAmount: '80.00',
      currency: 'EUR',
      effectiveDate: monthDay(11),
      postings: [{ accountId: contaUsd.id, amount: '80.00', direction: 'credit' }],
    });

    const dashboard = await api(app)
      .get(dashboardUrl(user.spaceId, monthKey))
      .set(auth(user.accessToken));
    expect(dashboard.body.totalExpense).toBe('500.00');
    expect(dashboard.body.unconvertedCount).toBe(1);
  });

  it('converte o patrimonio liquido e lista a conta sem taxa fora das somas', async () => {
    const user = await bootstrapUser(app);
    const contaUsd = await createAccount(app, user.accessToken, user.spaceId, {
      name: 'Conta USD',
      currency: 'USD',
    });

    await createTransaction(app, user.accessToken, user.spaceId, {
      type: 'income',
      description: 'Deposito em dolar',
      totalAmount: '100.00',
      effectiveDate: monthDay(5),
      postings: [{ accountId: contaUsd.id, amount: '100.00', direction: 'debit' }],
    });

    const semTaxa = await api(app).get(reportUrl(user.spaceId)).set(auth(user.accessToken));
    expect(semTaxa.status).toBe(200);
    expect(semTaxa.body.netWorth.currency).toBe('BRL');
    expect(semTaxa.body.netWorth.assets).toBe('0.00');
    expect(semTaxa.body.netWorth.accounts[0]).toMatchObject({
      currency: 'USD',
      balance: '100.00',
      balanceInBase: null,
    });

    await createRate(app, user.accessToken, user.spaceId, {
      fromCurrency: 'USD',
      toCurrency: 'BRL',
      rate: '5.0000',
      asOf: monthDay(1),
    });

    const comTaxa = await api(app).get(reportUrl(user.spaceId)).set(auth(user.accessToken));
    expect(comTaxa.body.netWorth.assets).toBe('500.00');
    expect(comTaxa.body.netWorth.netWorth).toBe('500.00');
    expect(comTaxa.body.netWorth.accounts[0]).toMatchObject({
      currency: 'USD',
      balance: '100.00',
      balanceInBase: '500.00',
    });
  });

  it('recusa transferencia entre contas de moedas diferentes', async () => {
    const user = await bootstrapUser(app);
    const contaBrl = await createAccount(app, user.accessToken, user.spaceId, {
      name: 'Conta BRL',
      currency: 'BRL',
    });
    const contaUsd = await createAccount(app, user.accessToken, user.spaceId, {
      name: 'Conta USD',
      currency: 'USD',
    });

    const transferencia = await createTransaction(app, user.accessToken, user.spaceId, {
      type: 'transfer',
      description: 'Transferencia entre moedas',
      totalAmount: '100.00',
      effectiveDate: monthDay(10),
      postings: [
        { accountId: contaBrl.id, amount: '100.00', direction: 'credit' },
        { accountId: contaUsd.id, amount: '100.00', direction: 'debit' },
      ],
    });
    expect(transferencia.status).toBe(400);
    expect(transferencia.body.code).toBe('CURRENCY_MISMATCH');
  });

  it('isola as taxas por espaco e recusa acesso de outro usuario', async () => {
    const alice = await bootstrapUser(app);
    const bob = await bootstrapUser(app);

    await createRate(app, alice.accessToken, alice.spaceId, {
      fromCurrency: 'USD',
      toCurrency: 'BRL',
      rate: '5.0000',
      asOf: monthDay(1),
    });

    const doBob = await listRates(app, bob.accessToken, bob.spaceId);
    expect(doBob.body).toHaveLength(0);

    const acessoIndevido = await listRates(app, bob.accessToken, alice.spaceId);
    expect(acessoIndevido.status).toBe(403);
  });
});

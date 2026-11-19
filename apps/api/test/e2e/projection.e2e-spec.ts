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
  createCreditCard,
  createTransaction,
  defaultSpaceId,
  registerUser,
} from './utils/factory';

const projectionUrl = (spaceId: string) =>
  `/api/v1/financial-spaces/${spaceId}/summary/projection`;
const obligationUrl = (spaceId: string) => `/api/v1/financial-spaces/${spaceId}/obligations`;

/** Dia (UTC) deslocado em N dias a partir de hoje, no formato `YYYY-MM-DD`. */
function isoOffset(days: number): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days))
    .toISOString()
    .slice(0, 10);
}

function createObligation(
  app: INestApplication,
  token: string,
  spaceId: string,
  body: Record<string, unknown>,
) {
  return api(app).post(obligationUrl(spaceId)).set(auth(token)).send(body);
}

function getProjection(app: INestApplication, token: string, spaceId: string, query = '') {
  return api(app).get(`${projectionUrl(spaceId)}${query}`).set(auth(token));
}

describe('E2E | Saldo projetado', () => {
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

  it('parte do saldo realizado e caminha pelos compromissos em aberto', async () => {
    const user = await bootstrapUser(app);
    const account = await createAccount(app, user.accessToken, user.spaceId);

    await createTransaction(app, user.accessToken, user.spaceId, {
      type: 'income',
      description: 'Salario',
      totalAmount: '1000.00',
      effectiveDate: isoOffset(0),
      postings: [{ accountId: account.id, amount: '1000.00', direction: 'debit' }],
    });
    await createObligation(app, user.accessToken, user.spaceId, {
      type: 'expense',
      description: 'Aluguel',
      amount: '300.00',
      dueDate: isoOffset(5),
    });

    const res = await getProjection(app, user.accessToken, user.spaceId);
    expect(res.status).toBe(200);
    expect(res.body.today).toBe(isoOffset(0));
    expect(res.body.horizonDays).toBe(30);
    expect(res.body.openingBalance).toBe('1000.00');
    expect(res.body.closingBalance).toBe('700.00');
    expect(res.body.minBalance).toBe('700.00');
    expect(res.body.willGoNegative).toBe(false);
    expect(res.body.upcomingCount).toBe(1);
    expect(res.body.upcomingAmount).toBe('300.00');
    expect(res.body.points).toEqual([
      { date: isoOffset(5), inflow: '0.00', outflow: '300.00', net: '-300.00', balance: '700.00' },
    ]);
  });

  it('joga os vencimentos passados no dia de hoje', async () => {
    const user = await bootstrapUser(app);
    const account = await createAccount(app, user.accessToken, user.spaceId);

    await createTransaction(app, user.accessToken, user.spaceId, {
      type: 'income',
      description: 'Entrada',
      totalAmount: '500.00',
      effectiveDate: isoOffset(0),
      postings: [{ accountId: account.id, amount: '500.00', direction: 'debit' }],
    });
    await createObligation(app, user.accessToken, user.spaceId, {
      type: 'expense',
      description: 'Conta atrasada',
      amount: '150.00',
      dueDate: isoOffset(-2),
    });

    const res = await getProjection(app, user.accessToken, user.spaceId);
    expect(res.body.points).toEqual([
      { date: isoOffset(0), inflow: '0.00', outflow: '150.00', net: '-150.00', balance: '350.00' },
    ]);
  });

  it('o horizonte limita o que entra na projecao', async () => {
    const user = await bootstrapUser(app);
    await createObligation(app, user.accessToken, user.spaceId, {
      type: 'expense',
      description: 'Daqui a 10 dias',
      amount: '80.00',
      dueDate: isoOffset(10),
    });

    const padrao = await getProjection(app, user.accessToken, user.spaceId);
    expect(padrao.body.points).toHaveLength(1);

    const curto = await getProjection(app, user.accessToken, user.spaceId, '?horizonDays=5');
    expect(curto.body.horizonDays).toBe(5);
    expect(curto.body.points).toEqual([]);
    expect(curto.body.upcomingCount).toBe(0);
  });

  it('sinaliza quando o saldo fica negativo no horizonte', async () => {
    const user = await bootstrapUser(app);
    const account = await createAccount(app, user.accessToken, user.spaceId);

    await createTransaction(app, user.accessToken, user.spaceId, {
      type: 'income',
      description: 'Saldo inicial',
      totalAmount: '100.00',
      effectiveDate: isoOffset(0),
      postings: [{ accountId: account.id, amount: '100.00', direction: 'debit' }],
    });
    await createObligation(app, user.accessToken, user.spaceId, {
      type: 'expense',
      description: 'Despesa grande',
      amount: '400.00',
      dueDate: isoOffset(3),
    });

    const res = await getProjection(app, user.accessToken, user.spaceId);
    expect(res.body.willGoNegative).toBe(true);
    expect(res.body.minBalance).toBe('-300.00');
    expect(res.body.minBalanceDate).toBe(isoOffset(3));
    expect(res.body.closingBalance).toBe('-300.00');
  });

  it('nao conta a fatura do cartao (a compra ja e uma despesa realizada)', async () => {
    const user = await bootstrapUser(app);
    const account = await createAccount(app, user.accessToken, user.spaceId);

    await createTransaction(app, user.accessToken, user.spaceId, {
      type: 'income',
      description: 'Salario',
      totalAmount: '1000.00',
      effectiveDate: isoOffset(0),
      postings: [{ accountId: account.id, amount: '1000.00', direction: 'debit' }],
    });

    const card = await createCreditCard(app, user.accessToken, user.spaceId, {
      name: 'Nubank',
      closingDay: 5,
      dueDay: 15,
    });
    await api(app)
      .post(`/api/v1/financial-spaces/${user.spaceId}/credit-cards/${card.id}/purchases`)
      .set(auth(user.accessToken))
      .send({
        description: 'Notebook',
        totalAmount: '320.00',
        installments: 1,
        purchaseDate: isoOffset(-45),
      });

    const res = await getProjection(app, user.accessToken, user.spaceId);
    // A compra ja entrou no realizado como despesa confirmada (1000 - 320); a
    // fatura nao entra de novo, entao nao ha pontos projetados.
    expect(res.body.openingBalance).toBe('680.00');
    expect(res.body.points).toEqual([]);
    expect(res.body.upcomingCount).toBe(0);
  });

  it('isola a projecao por espaco financeiro', async () => {
    const dono = await bootstrapUser(app);
    await createObligation(app, dono.accessToken, dono.spaceId, {
      type: 'expense',
      description: 'Conta do dono',
      amount: '40.00',
      dueDate: isoOffset(1),
    });

    const outro = await registerUser(app);
    const outroSpace = await defaultSpaceId(app, outro.accessToken);

    const negado = await getProjection(app, outro.accessToken, dono.spaceId);
    expect(negado.status).toBe(403);

    const proprio = await getProjection(app, outro.accessToken, outroSpace);
    expect(proprio.status).toBe(200);
    expect(proprio.body.points).toEqual([]);
  });
});

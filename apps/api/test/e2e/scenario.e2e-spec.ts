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

const url = (spaceId: string) => `/api/v1/financial-spaces/${spaceId}/summary/scenario`;

const today = new Date().toISOString().slice(0, 10);
const inDays = (days: number) =>
  new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

/** Lanca uma receita confirmada (saldo realizado de partida). */
async function seedOpening(app: INestApplication, token: string, spaceId: string, amount: string) {
  const conta = await createAccount(app, token, spaceId);
  await createTransaction(app, token, spaceId, {
    type: 'income',
    description: 'Saldo inicial',
    totalAmount: amount,
    effectiveDate: today,
    postings: [{ accountId: conta.id, amount, direction: 'debit' }],
  });
}

function simulate(
  app: INestApplication,
  token: string,
  spaceId: string,
  body: Record<string, unknown>,
) {
  return api(app).post(url(spaceId)).set(auth(token)).send(body);
}

describe('E2E | Cenarios simples', () => {
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

  it('simula uma despesa hipotetica sem gravar nada', async () => {
    const user = await bootstrapUser(app);
    await seedOpening(app, user.accessToken, user.spaceId, '1000.00');

    const res = await simulate(app, user.accessToken, user.spaceId, {
      adjustments: [
        { description: 'Comprar notebook', type: 'expense', amount: '300.00', date: inDays(3) },
      ],
    });

    expect(res.status).toBe(201);
    expect(res.body.base).toMatchObject({
      openingBalance: '1000.00',
      closingBalance: '1000.00',
      willGoNegative: false,
    });
    expect(res.body.scenario.closingBalance).toBe('700.00');
    expect(res.body.impact).toEqual({
      closingBalanceDelta: '-300.00',
      minBalanceDelta: '-300.00',
      willGoNegative: false,
      turnsNegative: false,
      improves: false,
    });
    expect(res.body.adjustments).toHaveLength(1);
    expect(res.body.adjustments[0]).toMatchObject({ description: 'Comprar notebook' });

    // Nada e persistido: nenhuma obrigacao (nem transacao) foi criada.
    const obligations = await api(app)
      .get(`/api/v1/financial-spaces/${user.spaceId}/obligations`)
      .set(auth(user.accessToken));
    expect(obligations.body).toEqual([]);
  });

  it('sinaliza que o cenario passa a ficar negativo', async () => {
    const user = await bootstrapUser(app);
    await seedOpening(app, user.accessToken, user.spaceId, '1000.00');

    const negativado = inDays(4);
    const res = await simulate(app, user.accessToken, user.spaceId, {
      adjustments: [
        { description: 'Entrada de imovel', type: 'expense', amount: '1500.00', date: negativado },
      ],
    });

    expect(res.body.base.willGoNegative).toBe(false);
    expect(res.body.scenario.willGoNegative).toBe(true);
    expect(res.body.scenario.minBalance).toBe('-500.00');
    expect(res.body.scenario.minBalanceDate).toBe(negativado);
    expect(res.body.impact.turnsNegative).toBe(true);
  });

  it('uma receita hipotetica melhora o saldo', async () => {
    const user = await bootstrapUser(app);
    await seedOpening(app, user.accessToken, user.spaceId, '1000.00');

    const res = await simulate(app, user.accessToken, user.spaceId, {
      adjustments: [
        { description: 'Freelance', type: 'income', amount: '500.00', date: inDays(2) },
      ],
    });

    expect(res.body.scenario.closingBalance).toBe('1500.00');
    expect(res.body.impact).toEqual({
      closingBalanceDelta: '500.00',
      // O pior momento nao muda: a receita entra depois do saldo de partida.
      minBalanceDelta: '0.00',
      willGoNegative: false,
      turnsNegative: false,
      improves: true,
    });
  });

  it('descarta ajustes fora do horizonte', async () => {
    const user = await bootstrapUser(app);
    await seedOpening(app, user.accessToken, user.spaceId, '1000.00');

    const res = await simulate(app, user.accessToken, user.spaceId, {
      horizonDays: 30,
      adjustments: [
        { description: 'Muito adiante', type: 'expense', amount: '900.00', date: inDays(45) },
      ],
    });

    expect(res.body.scenario.closingBalance).toBe('1000.00');
    expect(res.body.impact.closingBalanceDelta).toBe('0.00');
  });

  it('valida o payload (400)', async () => {
    const user = await bootstrapUser(app);

    const tipoInvalido = await simulate(app, user.accessToken, user.spaceId, {
      adjustments: [{ description: 'X', type: 'transfer', amount: '10.00', date: inDays(1) }],
    });
    expect(tipoInvalido.status).toBe(400);

    const semAjustes = await simulate(app, user.accessToken, user.spaceId, {});
    expect(semAjustes.status).toBe(400);
  });

  it('isola os cenarios por espaco financeiro', async () => {
    const dono = await bootstrapUser(app);
    await seedOpening(app, dono.accessToken, dono.spaceId, '1000.00');

    const outro = await registerUser(app);
    const outroSpace = await defaultSpaceId(app, outro.accessToken);

    const negado = await simulate(app, outro.accessToken, dono.spaceId, { adjustments: [] });
    expect(negado.status).toBe(403);

    const proprio = await simulate(app, outro.accessToken, outroSpace, { adjustments: [] });
    expect(proprio.status).toBe(201);
    expect(proprio.body.base.openingBalance).toBe('0.00');
  });
});

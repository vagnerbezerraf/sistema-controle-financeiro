import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './utils/app';
import { resetDatabase } from './utils/db';
import { api, auth, bootstrapUser, createAccount, createCreditCard } from './utils/factory';

const calendarUrl = (spaceId: string) => `/api/v1/financial-spaces/${spaceId}/calendar`;
const obligationUrl = (spaceId: string) => `/api/v1/financial-spaces/${spaceId}/obligations`;

function createObligation(
  app: INestApplication,
  token: string,
  spaceId: string,
  body: Record<string, unknown>,
) {
  return api(app).post(obligationUrl(spaceId)).set(auth(token)).send(body);
}

function getCalendar(app: INestApplication, token: string, spaceId: string, query = '') {
  return api(app).get(`${calendarUrl(spaceId)}${query}`).set(auth(token));
}

describe('E2E | Calendario financeiro', () => {
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

  it('agrupa as contas por vencimento e soma os totais do dia', async () => {
    const user = await bootstrapUser(app);

    await createObligation(app, user.accessToken, user.spaceId, {
      type: 'expense',
      description: 'Luz',
      amount: '100.00',
      dueDate: '2026-06-10',
    });
    await createObligation(app, user.accessToken, user.spaceId, {
      type: 'expense',
      description: 'Agua',
      amount: '50.00',
      dueDate: '2026-06-10',
    });
    await createObligation(app, user.accessToken, user.spaceId, {
      type: 'income',
      description: 'Freela',
      amount: '200.00',
      dueDate: '2026-06-20',
    });
    const cancelada = await createObligation(app, user.accessToken, user.spaceId, {
      type: 'expense',
      description: 'Assinatura cancelada',
      amount: '99.00',
      dueDate: '2026-06-10',
    });
    await api(app)
      .patch(`${obligationUrl(user.spaceId)}/${cancelada.body.id}`)
      .set(auth(user.accessToken))
      .send({ status: 'canceled', version: 0 });

    const res = await getCalendar(app, user.accessToken, user.spaceId, '?from=2026-06-01&to=2026-06-30');
    expect(res.status).toBe(200);
    expect(res.body.from).toBe('2026-06-01');
    expect(res.body.to).toBe('2026-06-30');

    expect(res.body.days.map((d: { date: string }) => d.date)).toEqual(['2026-06-10', '2026-06-20']);
    const dia10 = res.body.days[0];
    expect(dia10.expenseTotal).toBe('150.00');
    expect(dia10.incomeTotal).toBe('0.00');
    expect(dia10.entries.map((e: { description: string }) => e.description).sort()).toEqual([
      'Agua',
      'Luz',
    ]);
    expect(res.body.totals).toMatchObject({
      income: '200.00',
      expense: '150.00',
      net: '50.00',
      entryCount: 3,
    });
  });

  it('descarta as contas fora da janela do periodo', async () => {
    const user = await bootstrapUser(app);
    await createObligation(app, user.accessToken, user.spaceId, {
      type: 'expense',
      description: 'Maio',
      amount: '10.00',
      dueDate: '2026-05-31',
    });
    await createObligation(app, user.accessToken, user.spaceId, {
      type: 'expense',
      description: 'Junho',
      amount: '20.00',
      dueDate: '2026-06-15',
    });

    const res = await getCalendar(app, user.accessToken, user.spaceId, '?from=2026-06-01&to=2026-06-30');
    expect(res.body.days).toHaveLength(1);
    expect(res.body.days[0].entries).toHaveLength(1);
    expect(res.body.days[0].entries[0].description).toBe('Junho');
    expect(res.body.totals.expense).toBe('20.00');
  });

  it('inclui as faturas de cartao pelo dia de vencimento', async () => {
    const user = await bootstrapUser(app);
    const card = await createCreditCard(app, user.accessToken, user.spaceId, {
      name: 'Nubank',
      closingDay: 25,
      dueDay: 5,
    });

    // Compra em 10/05 cai no ciclo que fecha em 25/05 e vence em 05/06.
    await api(app)
      .post(`/api/v1/financial-spaces/${user.spaceId}/credit-cards/${card.id}/purchases`)
      .set(auth(user.accessToken))
      .send({ description: 'Notebook', totalAmount: '120.00', installments: 1, purchaseDate: '2026-05-10' });

    const junho = await getCalendar(app, user.accessToken, user.spaceId, '?from=2026-06-01&to=2026-06-30');
    const fatura = junho.body.days
      .flatMap((d: { entries: unknown[] }) => d.entries)
      .find((e: { kind: string }) => e.kind === 'invoice');
    expect(fatura).toBeDefined();
    expect(fatura.description).toBe('Fatura Nubank');
    expect(fatura.amount).toBe('120.00');
    expect(fatura.dueDate).toBe('2026-06-05');
    expect(fatura.type).toBe('expense');

    // Fora da janela de junho a fatura nao aparece.
    const agosto = await getCalendar(app, user.accessToken, user.spaceId, '?from=2026-08-01&to=2026-08-31');
    expect(agosto.body.days).toHaveLength(0);
    expect(agosto.body.totals.expense).toBe('0.00');
  });

  it('nao inclui fatura ja quitada (sem saldo devedor)', async () => {
    const user = await bootstrapUser(app);
    const conta = await createAccount(app, user.accessToken, user.spaceId, { name: 'Corrente' });
    const card = await createCreditCard(app, user.accessToken, user.spaceId, {
      name: 'Visa',
      closingDay: 25,
      dueDay: 5,
    });

    await api(app)
      .post(`/api/v1/financial-spaces/${user.spaceId}/credit-cards/${card.id}/purchases`)
      .set(auth(user.accessToken))
      .send({ description: 'Tenis', totalAmount: '300.00', installments: 1, purchaseDate: '2026-05-10' });

    const pago = await api(app)
      .post(`/api/v1/financial-spaces/${user.spaceId}/credit-cards/${card.id}/invoices/2026-05-25/pay`)
      .set(auth(user.accessToken))
      .send({ fromAccountId: conta.id });
    expect(pago.status).toBe(201);

    const res = await getCalendar(app, user.accessToken, user.spaceId, '?from=2026-06-01&to=2026-06-30');
    expect(res.body.days).toHaveLength(0);
  });

  it('usa o mes corrente quando from/to nao sao informados', async () => {
    const user = await bootstrapUser(app);
    const hoje = new Date().toISOString().slice(0, 10);
    await createObligation(app, user.accessToken, user.spaceId, {
      type: 'expense',
      description: 'Conta do mes',
      amount: '45.00',
      dueDate: hoje,
    });

    const res = await getCalendar(app, user.accessToken, user.spaceId);
    expect(res.status).toBe(200);
    const descricoes = res.body.days.flatMap((d: { entries: { description: string }[] }) =>
      d.entries.map((e) => e.description),
    );
    expect(descricoes).toContain('Conta do mes');
  });
});

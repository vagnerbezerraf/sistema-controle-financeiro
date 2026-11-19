import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './utils/app';
import { resetDatabase } from './utils/db';
import { api, auth, bootstrapUser, createCreditCard, registerUser, defaultSpaceId } from './utils/factory';

const alertsUrl = (spaceId: string) => `/api/v1/financial-spaces/${spaceId}/alerts`;
const obligationUrl = (spaceId: string) => `/api/v1/financial-spaces/${spaceId}/obligations`;

/** Dia (UTC) deslocado em N dias a partir de hoje, no formato `YYYY-MM-DD`. */
function isoOffset(days: number): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days));
  return d.toISOString().slice(0, 10);
}

function createObligation(
  app: INestApplication,
  token: string,
  spaceId: string,
  body: Record<string, unknown>,
) {
  return api(app).post(obligationUrl(spaceId)).set(auth(token)).send(body);
}

function getAlerts(app: INestApplication, token: string, spaceId: string, query = '') {
  return api(app).get(`${alertsUrl(spaceId)}${query}`).set(auth(token));
}

describe('E2E | Alertas de vencimento', () => {
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

  it('classifica vencidas, de hoje e proximas e descarta as distantes e canceladas', async () => {
    const user = await bootstrapUser(app);

    await createObligation(app, user.accessToken, user.spaceId, {
      type: 'expense',
      description: 'Vencida',
      amount: '100.00',
      dueDate: isoOffset(-3),
    });
    await createObligation(app, user.accessToken, user.spaceId, {
      type: 'expense',
      description: 'De hoje',
      amount: '50.00',
      dueDate: isoOffset(0),
    });
    await createObligation(app, user.accessToken, user.spaceId, {
      type: 'income',
      description: 'Em breve',
      amount: '200.00',
      dueDate: isoOffset(2),
    });
    await createObligation(app, user.accessToken, user.spaceId, {
      type: 'expense',
      description: 'Distante',
      amount: '999.00',
      dueDate: isoOffset(30),
    });
    const cancelada = await createObligation(app, user.accessToken, user.spaceId, {
      type: 'expense',
      description: 'Cancelada',
      amount: '70.00',
      dueDate: isoOffset(-1),
    });
    await api(app)
      .patch(`${obligationUrl(user.spaceId)}/${cancelada.body.id}`)
      .set(auth(user.accessToken))
      .send({ status: 'canceled', version: 0 });

    const res = await getAlerts(app, user.accessToken, user.spaceId);
    expect(res.status).toBe(200);
    expect(res.body.horizonDays).toBe(7);
    expect(res.body.counts).toEqual({ overdue: 1, dueToday: 1, dueSoon: 1, total: 3 });

    const ids = res.body.alerts.map((a: { description: string }) => a.description);
    expect(ids).toEqual(['Vencida', 'De hoje', 'Em breve']);
    expect(res.body.alerts.map((a: { severity: string }) => a.severity)).toEqual([
      'overdue',
      'due_today',
      'due_soon',
    ]);
    expect(res.body.alerts[0].daysUntilDue).toBe(-3);
    expect(res.body.alerts[2].amount).toBe('200');
  });

  it('inclui a fatura de cartao vencida como alerta', async () => {
    const user = await bootstrapUser(app);
    const card = await createCreditCard(app, user.accessToken, user.spaceId, {
      name: 'Nubank',
      closingDay: 5,
      dueDay: 15,
    });

    // Compra ha 45 dias: o ciclo fecha no proximo dia 5 e vence no dia 15 do mes
    // seguinte, sempre no passado (fatura vencida).
    await api(app)
      .post(`/api/v1/financial-spaces/${user.spaceId}/credit-cards/${card.id}/purchases`)
      .set(auth(user.accessToken))
      .send({
        description: 'Notebook',
        totalAmount: '320.00',
        installments: 1,
        purchaseDate: isoOffset(-45),
      });

    const res = await getAlerts(app, user.accessToken, user.spaceId);
    const fatura = res.body.alerts.find((a: { kind: string }) => a.kind === 'invoice');
    expect(fatura).toBeDefined();
    expect(fatura.description).toBe('Fatura Nubank');
    expect(fatura.amount).toBe('320.00');
    expect(fatura.severity).toBe('overdue');
  });

  it('o parametro horizonDays limita o que entra no alerta', async () => {
    const user = await bootstrapUser(app);
    await createObligation(app, user.accessToken, user.spaceId, {
      type: 'expense',
      description: 'Daqui a 10 dias',
      amount: '80.00',
      dueDate: isoOffset(10),
    });

    const padrao = await getAlerts(app, user.accessToken, user.spaceId);
    expect(padrao.body.counts.total).toBe(0);

    const ampliado = await getAlerts(app, user.accessToken, user.spaceId, '?horizonDays=30');
    expect(ampliado.body.horizonDays).toBe(30);
    expect(ampliado.body.counts).toEqual({ overdue: 0, dueToday: 0, dueSoon: 1, total: 1 });
    expect(ampliado.body.alerts[0].description).toBe('Daqui a 10 dias');
  });

  it('isola os alertas por espaco financeiro', async () => {
    const dono = await bootstrapUser(app);
    await createObligation(app, dono.accessToken, dono.spaceId, {
      type: 'expense',
      description: 'Conta do dono',
      amount: '40.00',
      dueDate: isoOffset(1),
    });

    const outro = await registerUser(app);
    const outroSpace = await defaultSpaceId(app, outro.accessToken);

    const res = await getAlerts(app, outro.accessToken, dono.spaceId);
    expect(res.status).toBe(403);

    const proprio = await getAlerts(app, outro.accessToken, outroSpace);
    expect(proprio.status).toBe(200);
    expect(proprio.body.counts.total).toBe(0);
  });
});

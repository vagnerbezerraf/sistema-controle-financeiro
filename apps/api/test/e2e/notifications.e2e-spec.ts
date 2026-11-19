import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './utils/app';
import { resetDatabase } from './utils/db';
import { api, auth, registerUser } from './utils/factory';

const prefsUrl = '/api/v1/notification-preferences';

describe('E2E | Preferencias de privacidade e notificacao', () => {
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

  it('devolve os padroes na primeira leitura e cria a linha do usuario', async () => {
    const user = await registerUser(app, undefined, 'Prefs E2E');

    const res = await api(app).get(prefsUrl).set(auth(user.accessToken));
    expect(res.status).toBe(200);
    expect(res.body.channels).toEqual({
      upcoming_due: { email: true, push: false, desktop: true },
      invoice_due: { email: true, push: false, desktop: true },
      budget_threshold: { email: true, push: false, desktop: true },
      negative_balance: { email: true, push: false, desktop: true },
    });
    expect(res.body.quietHours).toEqual({ enabled: false, start: '22:00', end: '07:00' });
    expect(res.body.includeAmounts).toBe(true);
    expect(res.body.timezone).toBe('America/Sao_Paulo');

    const saved = await prisma.notificationPreference.count({ where: { userId: user.userId } });
    expect(saved).toBe(1);
  });

  it('atualiza um patch parcial e persiste entre as leituras', async () => {
    const user = await registerUser(app);
    const headers = auth(user.accessToken);

    const patch = await api(app).patch(prefsUrl).set(headers).send({
      channels: { upcoming_due: { email: false, push: true }, negative_balance: { desktop: false } },
      quietHours: { enabled: true, start: '23:30', end: '06:30' },
      includeAmounts: false,
    });
    expect(patch.status).toBe(200);
    expect(patch.body.channels.upcoming_due).toEqual({ email: false, push: true, desktop: true });
    expect(patch.body.channels.negative_balance).toEqual({
      email: true,
      push: false,
      desktop: false,
    });
    expect(patch.body.channels.invoice_due).toEqual({ email: true, push: false, desktop: true });
    expect(patch.body.quietHours).toEqual({ enabled: true, start: '23:30', end: '06:30' });
    expect(patch.body.includeAmounts).toBe(false);

    const read = await api(app).get(prefsUrl).set(headers);
    expect(read.status).toBe(200);
    expect(read.body.channels.upcoming_due).toEqual({ email: false, push: true, desktop: true });
    expect(read.body.quietHours).toEqual({ enabled: true, start: '23:30', end: '06:30' });
    expect(read.body.includeAmounts).toBe(false);
  });

  it('rejeita horario fora do formato HH:MM', async () => {
    const user = await registerUser(app);

    const res = await api(app)
      .patch(prefsUrl)
      .set(auth(user.accessToken))
      .send({ quietHours: { enabled: true, start: '25:00' } });

    expect(res.status).toBe(400);
  });

  it('rejeita campos desconhecidos', async () => {
    const user = await registerUser(app);

    const res = await api(app)
      .patch(prefsUrl)
      .set(auth(user.accessToken))
      .send({ temaEscuro: true });

    expect(res.status).toBe(400);
  });

  it('exige autenticacao', async () => {
    expect((await api(app).get(prefsUrl)).status).toBe(401);
  });

  it('mantem as preferencias isoladas por usuario', async () => {
    const ana = await registerUser(app);
    const bruno = await registerUser(app);

    await api(app)
      .patch(prefsUrl)
      .set(auth(ana.accessToken))
      .send({ includeAmounts: false, channels: { upcoming_due: { email: false } } });

    const brunoPrefs = await api(app).get(prefsUrl).set(auth(bruno.accessToken));
    expect(brunoPrefs.body.includeAmounts).toBe(true);
    expect(brunoPrefs.body.channels.upcoming_due).toEqual({
      email: true,
      push: false,
      desktop: true,
    });
  });
});

import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './utils/app';
import { resetDatabase } from './utils/db';
import { api, auth, bootstrapUser } from './utils/factory';

const goalUrl = (spaceId: string) => `/api/v1/financial-spaces/${spaceId}/goals`;

/** Dia UTC deslocado em N dias a partir de hoje, no formato `YYYY-MM-DD`. */
function dayOffset(days: number): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days));
  return d.toISOString().slice(0, 10);
}

function createGoal(app: INestApplication, token: string, spaceId: string, body: Record<string, unknown>) {
  return api(app).post(goalUrl(spaceId)).set(auth(token)).send(body);
}

function listGoals(app: INestApplication, token: string, spaceId: string) {
  return api(app).get(goalUrl(spaceId)).set(auth(token));
}

function contribute(app: INestApplication, token: string, spaceId: string, goalId: string, amount: string) {
  return api(app)
    .post(`${goalUrl(spaceId)}/${goalId}/contributions`)
    .set(auth(token))
    .send({ amount });
}

async function createAndGetId(
  app: INestApplication,
  token: string,
  spaceId: string,
  body: Record<string, unknown>,
): Promise<string> {
  const res = await createGoal(app, token, spaceId, body);
  if (res.status !== 201) {
    throw new Error(`Falha ao criar meta (HTTP ${res.status}): ${JSON.stringify(res.body)}`);
  }
  return res.body.id as string;
}

describe('E2E | Metas', () => {
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

  it('cria a meta e deriva o progresso inicial', async () => {
    const user = await bootstrapUser(app);

    const created = await createGoal(app, user.accessToken, user.spaceId, {
      name: 'Reserva de emergencia',
      targetAmount: '1000.00',
      deadline: dayOffset(120),
    });
    expect(created.status).toBe(201);

    const view = await listGoals(app, user.accessToken, user.spaceId);
    expect(view.status).toBe(200);
    expect(view.body.items).toHaveLength(1);

    const item = view.body.items[0];
    expect(item.name).toBe('Reserva de emergencia');
    expect(item.targetAmount).toBe('1000.00');
    expect(item.currentAmount).toBe('0.00');
    expect(item.remainingAmount).toBe('1000.00');
    expect(item.progressPercent).toBe(0);
    expect(item.status).toBe('active');
    expect(item.overdue).toBe(false);
    expect(view.body.totals).toEqual({
      targetAmount: '1000.00',
      currentAmount: '0.00',
      remainingAmount: '1000.00',
    });
  });

  it('soma as contribuicoes no acumulado e atualiza o progresso', async () => {
    const user = await bootstrapUser(app);
    const goalId = await createAndGetId(app, user.accessToken, user.spaceId, {
      name: 'Reserva',
      targetAmount: '1000.00',
    });

    const primeira = await contribute(app, user.accessToken, user.spaceId, goalId, '250.00');
    expect(primeira.status).toBe(201);

    const segunda = await contribute(app, user.accessToken, user.spaceId, goalId, '150.00');
    expect(segunda.status).toBe(201);

    const view = await listGoals(app, user.accessToken, user.spaceId);
    const item = view.body.items[0];
    expect(item.currentAmount).toBe('400.00');
    expect(item.remainingAmount).toBe('600.00');
    expect(item.progressPercent).toBe(40);
    expect(item.status).toBe('active');
    expect(view.body.totals.currentAmount).toBe('400.00');
  });

  it('marca a meta como atingida e permite superar o alvo', async () => {
    const user = await bootstrapUser(app);
    const goalId = await createAndGetId(app, user.accessToken, user.spaceId, {
      name: 'Viagem',
      targetAmount: '500.00',
    });

    await contribute(app, user.accessToken, user.spaceId, goalId, '500.00');
    const atingida = await listGoals(app, user.accessToken, user.spaceId);
    expect(atingida.body.items[0].status).toBe('achieved');
    expect(atingida.body.items[0].progressPercent).toBe(100);
    expect(atingida.body.items[0].remainingAmount).toBe('0.00');

    await contribute(app, user.accessToken, user.spaceId, goalId, '100.00');
    const superada = await listGoals(app, user.accessToken, user.spaceId);
    expect(superada.body.items[0].status).toBe('achieved');
    expect(superada.body.items[0].currentAmount).toBe('600.00');
    expect(superada.body.items[0].progressPercent).toBe(120);
    expect(superada.body.items[0].remainingAmount).toBe('-100.00');
  });

  it('sinaliza a meta como atrasada quando o prazo vence sem ser atingida', async () => {
    const user = await bootstrapUser(app);
    await createGoal(app, user.accessToken, user.spaceId, {
      name: 'Curso',
      targetAmount: '2000.00',
      deadline: dayOffset(-1),
    });

    const view = await listGoals(app, user.accessToken, user.spaceId);
    expect(view.body.items[0].status).toBe('overdue');
    expect(view.body.items[0].overdue).toBe(true);
    expect(view.body.items[0].deadline).toBe(dayOffset(-1));
  });

  it('atualiza nome, alvo e situacao, e remove a meta', async () => {
    const user = await bootstrapUser(app);
    const goalId = await createAndGetId(app, user.accessToken, user.spaceId, {
      name: 'Viagem',
      targetAmount: '500.00',
    });

    const atualizada = await api(app)
      .patch(`${goalUrl(user.spaceId)}/${goalId}`)
      .set(auth(user.accessToken))
      .send({ name: 'Viagem 2027', targetAmount: '800.00', deadline: '2027-01-31' });
    expect(atualizada.status).toBe(200);
    expect(atualizada.body.name).toBe('Viagem 2027');
    expect(atualizada.body.targetAmount).toBe('800');

    const arquivada = await api(app)
      .patch(`${goalUrl(user.spaceId)}/${goalId}`)
      .set(auth(user.accessToken))
      .send({ state: 'archived' });
    expect(arquivada.status).toBe(200);
    expect(arquivada.body.state).toBe('archived');

    const removida = await api(app)
      .delete(`${goalUrl(user.spaceId)}/${goalId}`)
      .set(auth(user.accessToken));
    expect(removida.status).toBe(200);

    const view = await listGoals(app, user.accessToken, user.spaceId);
    expect(view.body.items).toHaveLength(0);
  });

  it('valida nome, alvo e contribuicao, e isola as metas entre espacos', async () => {
    const alice = await bootstrapUser(app);
    const bob = await bootstrapUser(app);

    const semNome = await createGoal(app, alice.accessToken, alice.spaceId, {
      name: '   ',
      targetAmount: '100.00',
    });
    expect(semNome.status).toBe(400);
    expect(semNome.body.code).toBe('INVALID_GOAL_NAME');

    const alvoInvalido = await createGoal(app, alice.accessToken, alice.spaceId, {
      name: 'Meta',
      targetAmount: '0',
    });
    expect(alvoInvalido.status).toBe(400);
    expect(alvoInvalido.body.code).toBe('INVALID_GOAL_TARGET');

    const goalId = await createAndGetId(app, alice.accessToken, alice.spaceId, {
      name: 'Meta',
      targetAmount: '100.00',
    });

    const contribuicaoInvalida = await contribute(app, alice.accessToken, alice.spaceId, goalId, '0');
    expect(contribuicaoInvalida.status).toBe(400);
    expect(contribuicaoInvalida.body.code).toBe('INVALID_GOAL_CONTRIBUTION');

    const semMeta = await listGoals(app, bob.accessToken, bob.spaceId);
    expect(semMeta.body.items).toHaveLength(0);

    const acessoIndevido = await api(app)
      .get(goalUrl(alice.spaceId))
      .set(auth(bob.accessToken));
    expect(acessoIndevido.status).toBe(403);
  });
});

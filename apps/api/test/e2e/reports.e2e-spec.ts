import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './utils/app';
import { resetDatabase } from './utils/db';
import { api, auth, bootstrapUser } from './utils/factory';

const reportsUrl = (spaceId: string) => `/api/v1/financial-spaces/${spaceId}/reports`;
const jobUrl = (spaceId: string, jobId: string) => `${reportsUrl(spaceId)}/${jobId}`;

function createJob(
  app: INestApplication,
  token: string,
  spaceId: string,
  body: Record<string, unknown> = {},
) {
  return api(app)
    .post(reportsUrl(spaceId))
    .set(auth(token))
    .send({ type: 'transactions_export', ...body });
}

describe('E2E | Relatorios assincronos', () => {
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

  it('enfileira o relatorio e grava o evento no outbox na mesma transacao', async () => {
    const user = await bootstrapUser(app);

    const created = await createJob(app, user.accessToken, user.spaceId);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      financialSpaceId: user.spaceId,
      type: 'transactions_export',
      status: 'pending',
      rowCount: null,
      error: null,
      requestedBy: user.userId,
      startedAt: null,
      finishedAt: null,
    });
    // Sem periodo informado, o padrao preenche as duas pontas.
    expect(created.body.params.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(created.body.params.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const evento = await prisma.outboxEvent.findFirst({
      where: { eventType: 'report.requested', financialSpaceId: user.spaceId },
    });
    expect(evento).not.toBeNull();
    expect((evento!.payload as { jobId: string }).jobId).toBe(created.body.id);
  });

  it('preserva o periodo informado e lista os jobs mais recentes primeiro', async () => {
    const user = await bootstrapUser(app);

    const primeiro = await createJob(app, user.accessToken, user.spaceId, {
      from: '2026-01-01',
      to: '2026-01-31',
    });
    expect(primeiro.body.params).toEqual({ from: '2026-01-01', to: '2026-01-31' });

    const segundo = await createJob(app, user.accessToken, user.spaceId, { from: '2026-02-01' });
    expect(segundo.status).toBe(201);

    const listados = await api(app).get(reportsUrl(user.spaceId)).set(auth(user.accessToken));
    expect(listados.status).toBe(200);
    expect(listados.body).toHaveLength(2);
    expect(listados.body[0].id).toBe(segundo.body.id);

    const consultado = await api(app).get(jobUrl(user.spaceId, primeiro.body.id)).set(auth(user.accessToken));
    expect(consultado.status).toBe(200);
    expect(consultado.body.id).toBe(primeiro.body.id);

    const inexistente = await api(app)
      .get(jobUrl(user.spaceId, '00000000-0000-0000-0000-000000000000'))
      .set(auth(user.accessToken));
    expect(inexistente.status).toBe(404);
  });

  it('valida o tipo, a ordem e o teto do periodo', async () => {
    const user = await bootstrapUser(app);

    const tipoInvalido = await api(app)
      .post(reportsUrl(user.spaceId))
      .set(auth(user.accessToken))
      .send({ type: 'pdf_magico' });
    expect(tipoInvalido.status).toBe(400);

    const invertido = await createJob(app, user.accessToken, user.spaceId, {
      from: '2026-02-01',
      to: '2026-01-01',
    });
    expect(invertido.status).toBe(400);
    expect(invertido.body.code).toBe('INVALID_PERIOD');

    const longoDemais = await createJob(app, user.accessToken, user.spaceId, {
      from: '2025-01-01',
      to: '2026-12-31',
    });
    expect(longoDemais.status).toBe(400);
    expect(longoDemais.body.code).toBe('PERIOD_TOO_LONG');
  });

  it('recusa o download enquanto pendente e entrega o conteudo quando pronto', async () => {
    const user = await bootstrapUser(app);
    const created = await createJob(app, user.accessToken, user.spaceId);

    const pendente = await api(app)
      .get(`${jobUrl(user.spaceId, created.body.id)}/download`)
      .set(auth(user.accessToken));
    expect(pendente.status).toBe(409);
    expect(pendente.body.code).toBe('REPORT_NOT_READY');
    expect(pendente.body.status).toBe('pending');

    // Simula o desfecho do worker gravando o resultado em cache.
    const csv = '\uFEFFdata,tipo,valor\r\n2026-11-10,expense,100.00';
    await prisma.reportJob.update({
      where: { id: created.body.id },
      data: {
        status: 'done',
        result: {
          fileName: 'transacoes-2026-11-01_2026-11-30.csv',
          contentType: 'text/csv; charset=utf-8',
          content: csv,
          rowCount: 1,
        },
        rowCount: 1,
        startedAt: new Date(),
        finishedAt: new Date(),
      },
    });

    const baixado = await api(app)
      .get(`${jobUrl(user.spaceId, created.body.id)}/download`)
      .set(auth(user.accessToken));
    expect(baixado.status).toBe(200);
    expect(baixado.headers['content-type']).toContain('text/csv');
    expect(baixado.headers['content-disposition']).toContain('transacoes-2026-11-01_2026-11-30.csv');
    expect(baixado.text).toBe(csv);
  });

  it('isola os relatorios por espaco e recusa acesso de outro usuario', async () => {
    const alice = await bootstrapUser(app);
    const bob = await bootstrapUser(app);

    await createJob(app, alice.accessToken, alice.spaceId);

    const doBob = await api(app).get(reportsUrl(bob.spaceId)).set(auth(bob.accessToken));
    expect(doBob.body).toHaveLength(0);

    const acessoIndevido = await api(app)
      .get(reportsUrl(alice.spaceId))
      .set(auth(bob.accessToken));
    expect(acessoIndevido.status).toBe(403);
  });
});

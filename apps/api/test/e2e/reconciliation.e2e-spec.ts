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

const importsUrl = (spaceId: string) => `/api/v1/financial-spaces/${spaceId}/imports`;
const reconciliationUrl = (spaceId: string) => `/api/v1/financial-spaces/${spaceId}/reconciliation`;
const obligationUrl = (spaceId: string) => `/api/v1/financial-spaces/${spaceId}/obligations`;

function createObligation(
  app: INestApplication,
  token: string,
  spaceId: string,
  body: Record<string, unknown>,
) {
  return api(app).post(obligationUrl(spaceId)).set(auth(token)).send(body);
}

function listObligations(app: INestApplication, token: string, spaceId: string) {
  return api(app).get(obligationUrl(spaceId)).set(auth(token));
}

/** Gera a previa e aplica um CSV, devolvendo o id do lote. */
async function importCsv(
  app: INestApplication,
  token: string,
  spaceId: string,
  accountId: string,
  csv: string,
): Promise<string> {
  const preview = await api(app)
    .post(`${importsUrl(spaceId)}/preview`)
    .set(auth(token))
    .send({ csv, accountId });
  const batchId = preview.body.batch.id as string;
  const commit = await api(app).post(`${importsUrl(spaceId)}/${batchId}/commit`).set(auth(token));
  if (commit.status !== 201) {
    throw new Error(`Falha ao aplicar o lote (HTTP ${commit.status}): ${JSON.stringify(commit.body)}`);
  }
  return batchId;
}

function view(app: INestApplication, token: string, spaceId: string, batchId?: string) {
  const query = batchId ? `?batchId=${batchId}` : '';
  return api(app).get(`${reconciliationUrl(spaceId)}${query}`).set(auth(token));
}

function apply(app: INestApplication, token: string, spaceId: string, matches: unknown[]) {
  return api(app).post(`${reconciliationUrl(spaceId)}/apply`).set(auth(token)).send({ matches });
}

function auto(app: INestApplication, token: string, spaceId: string, batchId?: string) {
  return api(app)
    .post(`${reconciliationUrl(spaceId)}/auto`)
    .set(auth(token))
    .send(batchId ? { batchId } : {});
}

const CSV_LUZ = ['data;descricao;valor;tipo', '10/06/2026;Conta de luz;120,00;despesa'].join('\n');

describe('E2E | Conciliacao de contas previstas com itens importados', () => {
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

  it('sugere o casamento entre a conta prevista e o item importado', async () => {
    const user = await bootstrapUser(app);
    const conta = await createAccount(app, user.accessToken, user.spaceId, { name: 'Corrente' });
    await createObligation(app, user.accessToken, user.spaceId, {
      type: 'expense',
      description: 'Conta de luz',
      amount: '120.00',
      dueDate: '2026-06-10',
    });
    const batchId = await importCsv(app, user.accessToken, user.spaceId, conta.id, CSV_LUZ);

    const res = await view(app, user.accessToken, user.spaceId, batchId);
    expect(res.status).toBe(200);
    expect(res.body.batchId).toBe(batchId);
    expect(res.body.obligations).toHaveLength(1);
    expect(res.body.transactions).toHaveLength(1);
    expect(res.body.transactions[0]).toMatchObject({ description: 'Conta de luz', batchId });

    expect(res.body.suggestions).toHaveLength(1);
    expect(res.body.suggestions[0]).toMatchObject({ score: 100, band: 'high' });
    expect(res.body.suggestions[0].reasons).toEqual(
      expect.arrayContaining(['valor_igual', 'mesma_data', 'descricao_similar']),
    );
    expect(res.body.counts).toEqual({ high: 1, medium: 0, low: 0 });
  });

  it('aplica manualmente os pares e deixa de listar os conciliados', async () => {
    const user = await bootstrapUser(app);
    const conta = await createAccount(app, user.accessToken, user.spaceId, { name: 'Corrente' });
    const obligation = await createObligation(app, user.accessToken, user.spaceId, {
      type: 'expense',
      description: 'Conta de luz',
      amount: '120.00',
      dueDate: '2026-06-10',
    });
    const batchId = await importCsv(app, user.accessToken, user.spaceId, conta.id, CSV_LUZ);
    const sugestao = (await view(app, user.accessToken, user.spaceId, batchId)).body.suggestions[0];
    const par = { obligationId: sugestao.obligationId, transactionId: sugestao.transactionId };

    const res = await apply(app, user.accessToken, user.spaceId, [par]);
    expect(res.status).toBe(201);
    expect(res.body.appliedCount).toBe(1);
    expect(res.body.applied[0]).toMatchObject({ status: 'reconciled' });

    const obrigacoes = await listObligations(app, user.accessToken, user.spaceId);
    expect(obrigacoes.body).toHaveLength(1);
    expect(obrigacoes.body[0]).toMatchObject({
      id: obligation.body.id,
      status: 'reconciled',
      transactionId: res.body.applied[0].transactionId,
    });

    // Depois de conciliada a conta sai da visao (nao esta mais em aberto) e o
    // item tambem deixa de ser candidato.
    const depois = await view(app, user.accessToken, user.spaceId, batchId);
    expect(depois.body.obligations).toHaveLength(0);
    expect(depois.body.transactions).toHaveLength(0);
    expect(depois.body.suggestions).toHaveLength(0);
  });

  it('concatena automaticamente apenas os casamentos de alta confianca', async () => {
    const user = await bootstrapUser(app);
    const conta = await createAccount(app, user.accessToken, user.spaceId, { name: 'Corrente' });
    await createObligation(app, user.accessToken, user.spaceId, {
      type: 'expense',
      description: 'Conta de luz',
      amount: '120.00',
      dueDate: '2026-06-10',
    });
    await createObligation(app, user.accessToken, user.spaceId, {
      type: 'expense',
      description: 'Condominio',
      amount: '300.00',
      dueDate: '2026-06-25',
    });
    const csv = [
      'data;descricao;valor;tipo',
      '10/06/2026;Conta de luz;120,00;despesa',
      '25/06/2026;Outro gasto;50,00;despesa',
    ].join('\n');
    const batchId = await importCsv(app, user.accessToken, user.spaceId, conta.id, csv);

    const res = await auto(app, user.accessToken, user.spaceId, batchId);
    expect(res.status).toBe(201);
    expect(res.body.appliedCount).toBe(1);

    const obrigacoes = await listObligations(app, user.accessToken, user.spaceId);
    const porDescricao = Object.fromEntries(
      obrigacoes.body.map((o: { description: string; status: string }) => [o.description, o.status]),
    );
    expect(porDescricao['Conta de luz']).toBe('reconciled');
    // O casamento fraco continua em aberto para revisao manual.
    expect(porDescricao.Condominio).toBe('pending');
  });

  it('nao aplica nada quando nao ha casamento de alta confianca', async () => {
    const user = await bootstrapUser(app);
    const conta = await createAccount(app, user.accessToken, user.spaceId, { name: 'Corrente' });
    await createObligation(app, user.accessToken, user.spaceId, {
      type: 'expense',
      description: 'Assinatura',
      amount: '1000.00',
      dueDate: '2026-06-05',
    });
    const csv = ['data;descricao;valor;tipo', '05/06/2026;Outro;10,00;despesa'].join('\n');
    const batchId = await importCsv(app, user.accessToken, user.spaceId, conta.id, csv);

    const res = await auto(app, user.accessToken, user.spaceId, batchId);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ applied: [], appliedCount: 0 });
  });

  it('valida o pedido manual e o lote informado', async () => {
    const user = await bootstrapUser(app);
    const conta = await createAccount(app, user.accessToken, user.spaceId, { name: 'Corrente' });
    const obligation = await createObligation(app, user.accessToken, user.spaceId, {
      type: 'expense',
      description: 'Conta de luz',
      amount: '120.00',
      dueDate: '2026-06-10',
    });
    const batchId = await importCsv(app, user.accessToken, user.spaceId, conta.id, CSV_LUZ);
    const sugestao = (await view(app, user.accessToken, user.spaceId, batchId)).body.suggestions[0];
    const par = { obligationId: sugestao.obligationId, transactionId: sugestao.transactionId };

    // Lote inexistente na visao -> 404.
    const loteInexistente = await view(
      app,
      user.accessToken,
      user.spaceId,
      '00000000-0000-0000-0000-000000000000',
    );
    expect(loteInexistente.status).toBe(404);

    // Lista vazia de pares -> 400 (validacao do DTO).
    const vazio = await apply(app, user.accessToken, user.spaceId, []);
    expect(vazio.status).toBe(400);

    // Mesma conta duas vezes no pedido -> 400.
    const duplicado = await apply(app, user.accessToken, user.spaceId, [par, par]);
    expect(duplicado.status).toBe(400);
    expect(duplicado.body.code).toBe('DUPLICATE_OBLIGATION');

    // Item nao confirmado (agendado) -> 400.
    const agendada = await createTransaction(app, user.accessToken, user.spaceId, {
      type: 'expense',
      status: 'scheduled',
      description: 'Agendada',
      totalAmount: '120.00',
      effectiveDate: '2026-06-10',
      postings: [{ accountId: conta.id, amount: '120.00', direction: 'credit' }],
    });
    const naoConfirmada = await apply(app, user.accessToken, user.spaceId, [
      { obligationId: obligation.body.id, transactionId: agendada.body.id },
    ]);
    expect(naoConfirmada.status).toBe(400);
    expect(naoConfirmada.body.code).toBe('TRANSACTION_NOT_CONFIRMED');

    // Primeira conciliacao ok; a segunda na mesma conta -> 400 ja conciliada.
    const ok = await apply(app, user.accessToken, user.spaceId, [par]);
    expect(ok.status).toBe(201);
    const denovo = await apply(app, user.accessToken, user.spaceId, [par]);
    expect(denovo.status).toBe(400);
    expect(denovo.body.code).toBe('ALREADY_RECONCILED');
  });

  it('isola a conciliacao por espaco financeiro', async () => {
    const dono = await bootstrapUser(app);
    const conta = await createAccount(app, dono.accessToken, dono.spaceId, { name: 'Corrente' });
    const batchId = await importCsv(app, dono.accessToken, dono.spaceId, conta.id, CSV_LUZ);

    const outro = await registerUser(app);
    const outroSpace = await defaultSpaceId(app, outro.accessToken);

    const negadoView = await view(app, outro.accessToken, dono.spaceId, batchId);
    expect(negadoView.status).toBe(403);

    const negadoAuto = await auto(app, outro.accessToken, dono.spaceId, batchId);
    expect(negadoAuto.status).toBe(403);

    const proprio = await view(app, outro.accessToken, outroSpace);
    expect(proprio.status).toBe(200);
    expect(proprio.body.suggestions).toEqual([]);
  });
});

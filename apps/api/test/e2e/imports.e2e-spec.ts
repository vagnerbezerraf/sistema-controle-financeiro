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

const base = (spaceId: string) => `/api/v1/financial-spaces/${spaceId}/imports`;

/** Extrato com cabecalho, item valido, duplicado no arquivo e linha invalida. */
const CSV = [
  'data;descricao;valor;tipo',
  '15/06/2026;Mercado;100,00;despesa',
  '16/06/2026;Salario;5000,00;receita',
  '16/06/2026;Salario;5000,00;receita',
  'data-ruim;;abc;sei-la',
].join('\n');

function preview(app: INestApplication, token: string, spaceId: string, body: Record<string, unknown>) {
  return api(app).post(`${base(spaceId)}/preview`).set(auth(token)).send(body);
}

function commit(app: INestApplication, token: string, spaceId: string, batchId: string) {
  return api(app).post(`${base(spaceId)}/${batchId}/commit`).set(auth(token));
}

function undo(app: INestApplication, token: string, spaceId: string, batchId: string) {
  return api(app).delete(`${base(spaceId)}/${batchId}`).set(auth(token));
}

function detail(app: INestApplication, token: string, spaceId: string, batchId: string) {
  return api(app).get(`${base(spaceId)}/${batchId}`).set(auth(token));
}

function listBatches(app: INestApplication, token: string, spaceId: string) {
  return api(app).get(base(spaceId)).set(auth(token));
}

function listTransactions(app: INestApplication, token: string, spaceId: string) {
  return api(app).get(`/api/v1/financial-spaces/${spaceId}/transactions`).set(auth(token));
}

describe('E2E | Importacao CSV', () => {
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

  it('gera a previa sem aplicar nada', async () => {
    const user = await bootstrapUser(app);
    const conta = await createAccount(app, user.accessToken, user.spaceId);

    const res = await preview(app, user.accessToken, user.spaceId, {
      csv: CSV,
      accountId: conta.id,
      fileName: 'extrato-junho.csv',
    });

    expect(res.status).toBe(201);
    expect(res.body.summary).toEqual({ total: 4, valid: 2, invalid: 1, duplicates: 1 });
    expect(res.body.batch).toMatchObject({
      status: 'previewed',
      fileName: 'extrato-junho.csv',
      accountId: conta.id,
      rowCount: 4,
      validCount: 2,
      invalidCount: 1,
      duplicateCount: 1,
      importedCount: 0,
      committedAt: null,
    });
    expect(res.body.rows.map((row: { status: string }) => row.status)).toEqual([
      'valid',
      'valid',
      'duplicate',
      'invalid',
    ]);
    expect(res.body.rows[2].duplicateOf).toBe('file');
    expect(res.body.rows[3].errors).toEqual(
      expect.arrayContaining(['data_invalida', 'descricao_ausente', 'valor_invalido', 'tipo_invalido']),
    );

    // A previa nao cria lancamentos.
    const trx = await listTransactions(app, user.accessToken, user.spaceId);
    expect(trx.body.items).toEqual([]);
  });

  it('aplica o lote criando apenas as linhas validas', async () => {
    const user = await bootstrapUser(app);
    const conta = await createAccount(app, user.accessToken, user.spaceId);

    const created = await preview(app, user.accessToken, user.spaceId, { csv: CSV, accountId: conta.id });
    const batchId = created.body.batch.id as string;

    const res = await commit(app, user.accessToken, user.spaceId, batchId);
    expect(res.status).toBe(201);
    expect(res.body.importedCount).toBe(2);
    expect(res.body.skippedCount).toBe(0);
    expect(res.body.batch).toMatchObject({ status: 'committed', importedCount: 2 });
    expect(res.body.batch.committedAt).not.toBeNull();

    const trx = await listTransactions(app, user.accessToken, user.spaceId);
    expect(trx.body.items).toHaveLength(2);
    const porDescricao = Object.fromEntries(
      trx.body.items.map((item: { description: string; type: string; totalAmount: string }) => [
        item.description,
        item,
      ]),
    );
    expect(porDescricao.Mercado).toMatchObject({ type: 'expense', totalAmount: '100' });
    expect(porDescricao.Salario).toMatchObject({ type: 'income', totalAmount: '5000' });
  });

  it('detecta duplicidade contra lancamentos ja existentes', async () => {
    const user = await bootstrapUser(app);
    const conta = await createAccount(app, user.accessToken, user.spaceId);
    await createTransaction(app, user.accessToken, user.spaceId, {
      type: 'expense',
      description: 'Mercado',
      totalAmount: '100.00',
      effectiveDate: '2026-06-15',
      postings: [{ accountId: conta.id, amount: '100.00', direction: 'credit' }],
    });

    const csv = ['data;descricao;valor;tipo', '15/06/2026;Mercado;100,00;despesa'].join('\n');
    const res = await preview(app, user.accessToken, user.spaceId, { csv, accountId: conta.id });

    expect(res.body.summary).toEqual({ total: 1, valid: 0, invalid: 0, duplicates: 1 });
    expect(res.body.rows[0]).toMatchObject({ status: 'duplicate', duplicateOf: 'existing' });

    // Importar tudo (o unico registro e duplicado) aplica zero lancamentos.
    const applied = await commit(app, user.accessToken, user.spaceId, res.body.batch.id);
    expect(applied.body.importedCount).toBe(0);
  });

  it('desfaz a importacao cancelando os lancamentos criados', async () => {
    const user = await bootstrapUser(app);
    const conta = await createAccount(app, user.accessToken, user.spaceId);

    const created = await preview(app, user.accessToken, user.spaceId, { csv: CSV, accountId: conta.id });
    const batchId = created.body.batch.id as string;
    await commit(app, user.accessToken, user.spaceId, batchId);

    const res = await undo(app, user.accessToken, user.spaceId, batchId);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'undone', importedCount: 2 });
    expect(res.body.undoneAt).not.toBeNull();

    const trx = await listTransactions(app, user.accessToken, user.spaceId);
    expect(trx.body.items).toHaveLength(2);
    expect(trx.body.items.every((item: { status: string }) => item.status === 'canceled')).toBe(true);
  });

  it('mantem o historico do lote apos aplicar (auditoria)', async () => {
    const user = await bootstrapUser(app);
    const conta = await createAccount(app, user.accessToken, user.spaceId);

    const created = await preview(app, user.accessToken, user.spaceId, { csv: CSV, accountId: conta.id });
    const batchId = created.body.batch.id as string;
    await commit(app, user.accessToken, user.spaceId, batchId);

    const historico = await listBatches(app, user.accessToken, user.spaceId);
    expect(historico.body).toHaveLength(1);
    expect(historico.body[0]).toMatchObject({ id: batchId, status: 'committed', importedCount: 2 });

    // O detalhe continua mostrando as linhas validas (ignora os lancamentos do proprio lote).
    const detalhe = await detail(app, user.accessToken, user.spaceId, batchId);
    expect(detalhe.status).toBe(200);
    expect(detalhe.body.summary).toEqual({ total: 4, valid: 2, invalid: 1, duplicates: 1 });
    expect(detalhe.body.rows.map((row: { status: string }) => row.status)).toEqual([
      'valid',
      'valid',
      'duplicate',
      'invalid',
    ]);
  });

  it('valida entrada e transicoes de estado', async () => {
    const user = await bootstrapUser(app);
    const conta = await createAccount(app, user.accessToken, user.spaceId);

    const vazio = await preview(app, user.accessToken, user.spaceId, { csv: '   ', accountId: conta.id });
    expect(vazio.status).toBe(400);

    const contaInvalida = await preview(app, user.accessToken, user.spaceId, {
      csv: CSV,
      accountId: '00000000-0000-0000-0000-000000000000',
    });
    expect(contaInvalida.status).toBe(400);

    // Desfazer um lote ainda em previa nao e permitido.
    const created = await preview(app, user.accessToken, user.spaceId, { csv: CSV, accountId: conta.id });
    const batchId = created.body.batch.id as string;
    const undoPrevia = await undo(app, user.accessToken, user.spaceId, batchId);
    expect(undoPrevia.status).toBe(409);

    // Importar o mesmo lote duas vezes nao e permitido.
    await commit(app, user.accessToken, user.spaceId, batchId);
    const reimportar = await commit(app, user.accessToken, user.spaceId, batchId);
    expect(reimportar.status).toBe(409);
  });

  it('isola os lotes por espaco financeiro', async () => {
    const dono = await bootstrapUser(app);
    const conta = await createAccount(app, dono.accessToken, dono.spaceId);
    const created = await preview(app, dono.accessToken, dono.spaceId, { csv: CSV, accountId: conta.id });

    const outro = await registerUser(app);
    const outroSpace = await defaultSpaceId(app, outro.accessToken);

    const negado = await preview(app, outro.accessToken, dono.spaceId, { csv: CSV, accountId: conta.id });
    expect(negado.status).toBe(403);

    const negadoDetalhe = await detail(app, outro.accessToken, dono.spaceId, created.body.batch.id);
    expect(negadoDetalhe.status).toBe(403);

    const proprio = await listBatches(app, outro.accessToken, outroSpace);
    expect(proprio.status).toBe(200);
    expect(proprio.body).toEqual([]);
  });
});

/** Extrato OFX (1.x SGML) com valido, FITID repetido e lancamento invalido. */
const OFX = [
  '<OFX>',
  '<BANKTRANLIST>',
  '<STMTTRN>',
  '<TRNTYPE>DEBIT',
  '<DTPOSTED>20260615',
  '<TRNAMT>-100.00',
  '<FITID>FIT-1',
  '<MEMO>Mercado</MEMO>',
  '</STMTTRN>',
  '<STMTTRN>',
  '<TRNTYPE>CREDIT',
  '<DTPOSTED>20260616120000[-3:BRT]',
  '<TRNAMT>5000.00',
  '<FITID>FIT-2',
  '<NAME>Salario',
  '</STMTTRN>',
  '<STMTTRN>',
  '<TRNTYPE>CREDIT',
  '<DTPOSTED>20260616120000[-3:BRT]',
  '<TRNAMT>5000.00',
  '<FITID>FIT-2',
  '<NAME>Salario',
  '</STMTTRN>',
  '<STMTTRN>',
  '<TRNTYPE>DEBIT',
  '<DTPOSTED>data-ruim',
  '<TRNAMT>abc',
  '</STMTTRN>',
  '</BANKTRANLIST>',
  '</OFX>',
].join('\n');

function previewOfx(app: INestApplication, token: string, spaceId: string, body: Record<string, unknown>) {
  return api(app).post(`${base(spaceId)}/preview-ofx`).set(auth(token)).send(body);
}

describe('E2E | Importacao OFX', () => {
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

  it('gera a previa sem aplicar nada e marca o formato do lote', async () => {
    const user = await bootstrapUser(app);
    const conta = await createAccount(app, user.accessToken, user.spaceId);

    const res = await previewOfx(app, user.accessToken, user.spaceId, {
      ofx: OFX,
      accountId: conta.id,
      fileName: 'extrato-junho.ofx',
    });

    expect(res.status).toBe(201);
    expect(res.body.summary).toEqual({ total: 4, valid: 2, invalid: 1, duplicates: 1 });
    expect(res.body.batch).toMatchObject({
      status: 'previewed',
      format: 'ofx',
      fileName: 'extrato-junho.ofx',
      rowCount: 4,
      validCount: 2,
      invalidCount: 1,
      duplicateCount: 1,
      importedCount: 0,
    });
    expect(res.body.rows.map((row: { status: string }) => row.status)).toEqual([
      'valid',
      'valid',
      'duplicate',
      'invalid',
    ]);
    // O identificador forte do OFX (FITID) e propagado para a linha.
    expect(res.body.rows[0].fitId).toBe('FIT-1');
    expect(res.body.rows[2]).toMatchObject({ duplicateOf: 'file', fitId: 'FIT-2' });
    expect(res.body.rows[3].errors).toEqual(
      expect.arrayContaining(['data_invalida', 'descricao_ausente', 'valor_invalido']),
    );

    const trx = await listTransactions(app, user.accessToken, user.spaceId);
    expect(trx.body.items).toEqual([]);
  });

  it('aplica o lote criando apenas as linhas validas', async () => {
    const user = await bootstrapUser(app);
    const conta = await createAccount(app, user.accessToken, user.spaceId);

    const created = await previewOfx(app, user.accessToken, user.spaceId, { ofx: OFX, accountId: conta.id });
    const batchId = created.body.batch.id as string;

    const res = await commit(app, user.accessToken, user.spaceId, batchId);
    expect(res.status).toBe(201);
    expect(res.body.importedCount).toBe(2);
    expect(res.body.batch).toMatchObject({ status: 'committed', format: 'ofx', importedCount: 2 });

    const trx = await listTransactions(app, user.accessToken, user.spaceId);
    expect(trx.body.items).toHaveLength(2);
    const porDescricao = Object.fromEntries(
      trx.body.items.map((item: { description: string; type: string; totalAmount: string }) => [
        item.description,
        item,
      ]),
    );
    expect(porDescricao.Mercado).toMatchObject({ type: 'expense', totalAmount: '100' });
    expect(porDescricao.Salario).toMatchObject({ type: 'income', totalAmount: '5000' });
  });

  it('detecta duplicidade contra lancamentos ja existentes', async () => {
    const user = await bootstrapUser(app);
    const conta = await createAccount(app, user.accessToken, user.spaceId);
    await createTransaction(app, user.accessToken, user.spaceId, {
      type: 'expense',
      description: 'Mercado',
      totalAmount: '100.00',
      effectiveDate: '2026-06-15',
      postings: [{ accountId: conta.id, amount: '100.00', direction: 'credit' }],
    });

    const ofx = [
      '<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260615<TRNAMT>-100.00<FITID>FIT-9<MEMO>Mercado</STMTTRN>',
    ].join('\n');
    const res = await previewOfx(app, user.accessToken, user.spaceId, { ofx, accountId: conta.id });

    expect(res.body.summary).toEqual({ total: 1, valid: 0, invalid: 0, duplicates: 1 });
    expect(res.body.rows[0]).toMatchObject({ status: 'duplicate', duplicateOf: 'existing' });
  });

  it('desfaz a importacao cancelando os lancamentos criados', async () => {
    const user = await bootstrapUser(app);
    const conta = await createAccount(app, user.accessToken, user.spaceId);

    const created = await previewOfx(app, user.accessToken, user.spaceId, { ofx: OFX, accountId: conta.id });
    const batchId = created.body.batch.id as string;
    await commit(app, user.accessToken, user.spaceId, batchId);

    const res = await undo(app, user.accessToken, user.spaceId, batchId);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'undone', format: 'ofx', importedCount: 2 });

    const trx = await listTransactions(app, user.accessToken, user.spaceId);
    expect(trx.body.items).toHaveLength(2);
    expect(trx.body.items.every((item: { status: string }) => item.status === 'canceled')).toBe(true);
  });

  it('valida entrada e isola os lotes por espaco financeiro', async () => {
    const user = await bootstrapUser(app);
    const conta = await createAccount(app, user.accessToken, user.spaceId);

    const vazio = await previewOfx(app, user.accessToken, user.spaceId, { ofx: '   ', accountId: conta.id });
    expect(vazio.status).toBe(400);

    const contaInvalida = await previewOfx(app, user.accessToken, user.spaceId, {
      ofx: OFX,
      accountId: '00000000-0000-0000-0000-000000000000',
    });
    expect(contaInvalida.status).toBe(400);

    const outro = await registerUser(app);
    const negado = await previewOfx(app, outro.accessToken, user.spaceId, { ofx: OFX, accountId: conta.id });
    expect(negado.status).toBe(403);
  });
});

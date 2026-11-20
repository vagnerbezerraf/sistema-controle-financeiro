import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

const url = (spaceId: string, transactionId: string) =>
  `/api/v1/financial-spaces/${spaceId}/transactions/${transactionId}/attachments`;

/** Conteudo de um "PNG" qualquer: para o upload so importam mimetype e tamanho. */
const pngBuffer = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const pngChecksum = createHash('sha256').update(pngBuffer).digest('hex');

describe('E2E | Comprovantes', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let storageDir: string;

  beforeAll(async () => {
    // Isola o storage dos comprovantes em um diretorio temporario por suite.
    storageDir = await mkdtemp(join(tmpdir(), 'scf-receipts-'));
    process.env.RECEIPT_STORAGE_DIR = storageDir;
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
    await rm(storageDir, { recursive: true, force: true });
    delete process.env.RECEIPT_STORAGE_DIR;
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  /** Cria espaco + conta + transacao e devolve o contexto do dono. */
  async function seedTransaction() {
    const user = await bootstrapUser(app);
    const conta = await createAccount(app, user.accessToken, user.spaceId);
    const trx = await createTransaction(app, user.accessToken, user.spaceId, {
      type: 'expense',
      description: 'Compra com comprovante',
      totalAmount: '120.00',
      effectiveDate: '2026-06-10',
      postings: [{ accountId: conta.id, amount: '120.00', direction: 'credit' }],
    });
    expect(trx.status).toBe(201);
    return { user, transactionId: trx.body.id as string };
  }

  function upload(
    token: string,
    spaceId: string,
    transactionId: string,
    buffer: Buffer,
    options: { filename: string; contentType: string },
  ) {
    return api(app)
      .post(url(spaceId, transactionId))
      .set(auth(token))
      .attach('file', buffer, { filename: options.filename, contentType: options.contentType });
  }

  it('anexa, lista e baixa um comprovante', async () => {
    const { user, transactionId } = await seedTransaction();

    const criado = await upload(user.accessToken, user.spaceId, transactionId, pngBuffer, {
      filename: 'recibo.png',
      contentType: 'image/png',
    });
    expect(criado.status).toBe(201);
    expect(criado.body).toMatchObject({
      transactionId,
      fileName: 'recibo.png',
      contentType: 'image/png',
      size: pngBuffer.length,
      checksum: pngChecksum,
    });

    const listado = await api(app).get(url(user.spaceId, transactionId)).set(auth(user.accessToken));
    expect(listado.status).toBe(200);
    expect(listado.body.items).toHaveLength(1);
    expect(listado.body.items[0].id).toBe(criado.body.id);

    const baixado = await api(app)
      .get(`${url(user.spaceId, transactionId)}/${criado.body.id}/download`)
      .set(auth(user.accessToken));
    expect(baixado.status).toBe(200);
    expect(baixado.headers['content-type']).toContain('image/png');
    expect(baixado.headers['content-disposition']).toContain('recibo.png');
    expect(Buffer.compare(baixado.body, pngBuffer)).toBe(0);
  });

  it('sanitiza o nome do arquivo e aceita PDF', async () => {
    const { user, transactionId } = await seedTransaction();
    const pdf = Buffer.from('%PDF-1.4 conteudo');

    const criado = await upload(user.accessToken, user.spaceId, transactionId, pdf, {
      filename: 'C:\\Users\\vagner\\..\\nota fiscal.pdf',
      contentType: 'application/pdf',
    });
    expect(criado.status).toBe(201);
    expect(criado.body.fileName).toBe('nota fiscal.pdf');
    expect(criado.body.contentType).toBe('application/pdf');
  });

  it('remove o comprovante e depois nao o encontra mais (204 e 404)', async () => {
    const { user, transactionId } = await seedTransaction();
    const criado = await upload(user.accessToken, user.spaceId, transactionId, pngBuffer, {
      filename: 'recibo.png',
      contentType: 'image/png',
    });

    const removido = await api(app)
      .delete(`${url(user.spaceId, transactionId)}/${criado.body.id}`)
      .set(auth(user.accessToken));
    expect(removido.status).toBe(204);

    const listado = await api(app).get(url(user.spaceId, transactionId)).set(auth(user.accessToken));
    expect(listado.body.items).toHaveLength(0);

    const baixado = await api(app)
      .get(`${url(user.spaceId, transactionId)}/${criado.body.id}/download`)
      .set(auth(user.accessToken));
    expect(baixado.status).toBe(404);
  });

  it('recusa tipo nao suportado e arquivo grande demais (400)', async () => {
    const { user, transactionId } = await seedTransaction();

    const tipoInvalido = await upload(
      user.accessToken,
      user.spaceId,
      transactionId,
      Buffer.from('MZ executavel'),
      { filename: 'malicioso.exe', contentType: 'application/x-msdownload' },
    );
    expect(tipoInvalido.status).toBe(400);
    expect(tipoInvalido.body.code).toBe('UNSUPPORTED_TYPE');

    // 6 MB passa do limite de negocio de 5 MB, mas fica abaixo do teto do multer.
    const grande = await upload(
      user.accessToken,
      user.spaceId,
      transactionId,
      Buffer.alloc(6 * 1024 * 1024, 1),
      { filename: 'gigante.png', contentType: 'image/png' },
    );
    expect(grande.status).toBe(400);
    expect(grande.body.code).toBe('FILE_TOO_LARGE');
  });

  it('exige o arquivo no campo file (400)', async () => {
    const { user, transactionId } = await seedTransaction();

    const semArquivo = await api(app)
      .post(url(user.spaceId, transactionId))
      .set(auth(user.accessToken))
      .field('observacao', 'sem arquivo');
    expect(semArquivo.status).toBe(400);
    expect(semArquivo.body.code).toBe('FILE_REQUIRED');
  });

  it('devolve 404 para transacao inexistente', async () => {
    const user = await bootstrapUser(app);

    const criado = await upload(
      user.accessToken,
      user.spaceId,
      '00000000-0000-0000-0000-000000000000',
      pngBuffer,
      { filename: 'recibo.png', contentType: 'image/png' },
    );
    expect(criado.status).toBe(404);
  });

  it('exige autenticacao (401) e isola os comprovantes por espaco (403)', async () => {
    const { user, transactionId } = await seedTransaction();

    const anonimo = await api(app)
      .get(url(user.spaceId, transactionId))
      .attach('file', pngBuffer, { filename: 'recibo.png', contentType: 'image/png' });
    expect(anonimo.status).toBe(401);

    const outro = await registerUser(app);
    const outroSpace = await defaultSpaceId(app, outro.accessToken);

    const negado = await upload(outro.accessToken, user.spaceId, transactionId, pngBuffer, {
      filename: 'recibo.png',
      contentType: 'image/png',
    });
    expect(negado.status).toBe(403);

    // O outro espaco segue acessivel (mas vazio).
    const vazio = await api(app)
      .get(url(outroSpace, transactionId))
      .set(auth(outro.accessToken));
    expect(vazio.status).toBe(404);
  });
});

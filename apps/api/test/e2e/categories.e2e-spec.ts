import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './utils/app';
import { resetDatabase } from './utils/db';
import { api, auth, bootstrapUser } from './utils/factory';

describe('E2E | Categorias', () => {
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

  it('semeia as categorias padrão na primeira listagem', async () => {
    const user = await bootstrapUser(app);

    const res = await api(app)
      .get(`/api/v1/financial-spaces/${user.spaceId}/categories`)
      .set(auth(user.accessToken));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(11);
    expect(res.body.every((c: { version: number }) => c.version === 0)).toBe(true);
  });

  it('cria e atualiza uma categoria (concorrência otimista via version)', async () => {
    const user = await bootstrapUser(app);
    const base = `/api/v1/financial-spaces/${user.spaceId}/categories`;

    const criada = await api(app)
      .post(base)
      .set(auth(user.accessToken))
      .send({ name: 'Pets', type: 'expense' });
    expect(criada.status).toBe(201);
    expect(criada.body.version).toBe(0);

    const atualizada = await api(app)
      .patch(`${base}/${criada.body.id}`)
      .set(auth(user.accessToken))
      .send({ color: '#123456', version: 0 });
    expect(atualizada.status).toBe(200);
    expect(atualizada.body.color).toBe('#123456');
    expect(atualizada.body.version).toBe(1);

    // Versão desatualizada: conflito e nada é sobrescrito.
    const desatualizada = await api(app)
      .patch(`${base}/${criada.body.id}`)
      .set(auth(user.accessToken))
      .send({ color: '#000000', version: 0 });
    expect(desatualizada.status).toBe(409);
    expect(desatualizada.body.code).toBe('STALE_VERSION');

    const depois = await api(app)
      .get(`/api/v1/financial-spaces/${user.spaceId}/categories`)
      .set(auth(user.accessToken));
    const persistida = depois.body.find((c: { id: string }) => c.id === criada.body.id);
    expect(persistida.color).toBe('#123456');
  });

  it('retorna 404 ao atualizar categoria inexistente', async () => {
    const user = await bootstrapUser(app);

    const res = await api(app)
      .patch(`/api/v1/financial-spaces/${user.spaceId}/categories/00000000-0000-0000-0000-000000000000`)
      .set(auth(user.accessToken))
      .send({ name: 'Fantasma', version: 0 });

    expect(res.status).toBe(404);
  });
});

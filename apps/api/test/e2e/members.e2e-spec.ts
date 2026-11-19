import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './utils/app';
import { resetDatabase } from './utils/db';
import { api, auth, bootstrapUser, registerUser, type RegisteredUser } from './utils/factory';

const spacesUrl = '/api/v1/financial-spaces';
const membersUrl = (spaceId: string) => `${spacesUrl}/${spaceId}/members`;
const invitesUrl = (spaceId: string) => `${spacesUrl}/${spaceId}/invites`;
const acceptUrl = '/api/v1/space-invites/accept';

function invite(app: INestApplication, token: string, spaceId: string, email: string, role: string) {
  return api(app).post(invitesUrl(spaceId)).set(auth(token)).send({ email, role });
}

function accept(app: INestApplication, token: string, inviteToken: string) {
  return api(app).post(acceptUrl).set(auth(token)).send({ token: inviteToken });
}

function listInvites(app: INestApplication, token: string, spaceId: string) {
  return api(app).get(invitesUrl(spaceId)).set(auth(token));
}

function listMembers(app: INestApplication, token: string, spaceId: string) {
  return api(app).get(membersUrl(spaceId)).set(auth(token));
}

/** Registra um usuario, convida e aceita — devolvendo o usuario ja membro. */
async function registerAndJoin(
  app: INestApplication,
  ownerToken: string,
  spaceId: string,
  role: string,
): Promise<RegisteredUser> {
  const user = await registerUser(app);
  const invited = await invite(app, ownerToken, spaceId, user.email, role);
  if (invited.status !== 201) {
    throw new Error(`Falha ao convidar (HTTP ${invited.status}): ${JSON.stringify(invited.body)}`);
  }
  const accepted = await accept(app, user.accessToken, invited.body.token);
  if (accepted.status !== 201) {
    throw new Error(`Falha ao aceitar convite (HTTP ${accepted.status}): ${JSON.stringify(accepted.body)}`);
  }
  return user;
}

/** Id da Membership de um e-mail. */
async function memberIdFor(
  app: INestApplication,
  token: string,
  spaceId: string,
  email: string,
): Promise<string> {
  const res = await listMembers(app, token, spaceId);
  const member = res.body.find((m: { email: string }) => m.email === email);
  if (!member) throw new Error(`Membro ${email} nao encontrado`);
  return member.id as string;
}

describe('E2E | Membros, convites e papeis', () => {
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

  it('convida por e-mail e libera o acesso somente apos o aceite', async () => {
    const dono = await bootstrapUser(app);
    const convidado = await registerUser(app);

    const invited = await invite(app, dono.accessToken, dono.spaceId, convidado.email, 'contributor');
    expect(invited.status).toBe(201);
    expect(invited.body.invite.status).toBe('pending');
    expect(invited.body.invite.role).toBe('contributor');
    expect(invited.body.invite.email).toBe(convidado.email);
    expect(typeof invited.body.token).toBe('string');
    expect(invited.body.acceptUrl).toContain(invited.body.token);

    // Enquanto o convite nao e aceito, o convidado ainda nao ve o espaco.
    const antes = await api(app).get(`${spacesUrl}/${dono.spaceId}`).set(auth(convidado.accessToken));
    expect(antes.status).toBe(403);

    // O dono ve 1 membro (ele) e 1 convite pendente.
    expect((await listMembers(app, dono.accessToken, dono.spaceId)).body).toHaveLength(1);
    expect((await listInvites(app, dono.accessToken, dono.spaceId)).body).toHaveLength(1);

    const aceito = await accept(app, convidado.accessToken, invited.body.token);
    expect(aceito.status).toBe(201);
    expect(aceito.body.spaceId).toBe(dono.spaceId);
    expect(aceito.body.role).toBe('contributor');

    // Agora o convidado enxerga o espaco; o convite sai da lista de pendentes.
    const depois = await api(app).get(`${spacesUrl}/${dono.spaceId}`).set(auth(convidado.accessToken));
    expect(depois.status).toBe(200);
    expect((await listMembers(app, dono.accessToken, dono.spaceId)).body).toHaveLength(2);
    expect((await listInvites(app, dono.accessToken, dono.spaceId)).body).toHaveLength(0);

    // Reutilizar o mesmo convite nao funciona.
    const denovo = await accept(app, convidado.accessToken, invited.body.token);
    expect(denovo.status).toBe(400);
    expect(denovo.body.code).toBe('INVITE_INVALID');
  });

  it('recusa o aceite de um convidado cujo e-mail nao corresponde', async () => {
    const dono = await bootstrapUser(app);
    const outro = await registerUser(app);

    const invited = await invite(app, dono.accessToken, dono.spaceId, 'destinatario@scf.test', 'viewer');
    const tentativa = await accept(app, outro.accessToken, invited.body.token);
    expect(tentativa.status).toBe(403);
    expect(tentativa.body.code).toBe('INVITE_EMAIL_MISMATCH');
  });

  it('altera o papel de um membro e o remove respeitando a hierarquia', async () => {
    const dono = await bootstrapUser(app);
    await registerAndJoin(app, dono.accessToken, dono.spaceId, 'admin');
    const leitor = await registerAndJoin(app, dono.accessToken, dono.spaceId, 'viewer');

    // O dono rebaixa o admin para colaborador e o admite de volta como admin.
    const leitorId = await memberIdFor(app, dono.accessToken, dono.spaceId, leitor.email);
    const promovido = await api(app)
      .patch(`${membersUrl(dono.spaceId)}/${leitorId}`)
      .set(auth(dono.accessToken))
      .send({ role: 'admin' });
    expect(promovido.status).toBe(200);
    expect(promovido.body.role).toBe('admin');

    // Um admin nao promove ninguem a admin.
    const outroLeitor = await registerAndJoin(app, dono.accessToken, dono.spaceId, 'viewer');
    const outroId = await memberIdFor(app, dono.accessToken, dono.spaceId, outroLeitor.email);
    const promocaoIndevida = await api(app)
      .patch(`${membersUrl(dono.spaceId)}/${outroId}`)
      .set(auth(leitor.accessToken))
      .send({ role: 'admin' });
    expect(promocaoIndevida.status).toBe(403);
    expect(promocaoIndevida.body.code).toBe('ROLE_CHANGE_NOT_ALLOWED');

    // Mas pode ajustar entre colaborador e leitura.
    const ajuste = await api(app)
      .patch(`${membersUrl(dono.spaceId)}/${outroId}`)
      .set(auth(leitor.accessToken))
      .send({ role: 'contributor' });
    expect(ajuste.status).toBe(200);
    expect(ajuste.body.role).toBe('contributor');

    // O admin remove o colaborador.
    const removido = await api(app)
      .delete(`${membersUrl(dono.spaceId)}/${outroId}`)
      .set(auth(leitor.accessToken));
    expect(removido.status).toBe(204);
    expect((await listMembers(app, dono.accessToken, dono.spaceId)).body).toHaveLength(3);

    // O dono nao pode remover a si mesmo.
    const donoId = await memberIdFor(app, dono.accessToken, dono.spaceId, dono.email);
    const autoRemocao = await api(app)
      .delete(`${membersUrl(dono.spaceId)}/${donoId}`)
      .set(auth(dono.accessToken));
    expect(autoRemocao.status).toBe(400);
    expect(autoRemocao.body.code).toBe('CANNOT_REMOVE_SELF');
  });

  it('valida os convites: papel nao atribuivel, membro existente, e-mail invalido e revogacao', async () => {
    const dono = await bootstrapUser(app);
    const membro = await registerAndJoin(app, dono.accessToken, dono.spaceId, 'contributor');

    const papelDono = await invite(app, dono.accessToken, dono.spaceId, 'alguem@scf.test', 'owner');
    expect(papelDono.status).toBe(400);
    expect(papelDono.body.code).toBe('ROLE_NOT_ASSIGNABLE');

    const jaMembro = await invite(app, dono.accessToken, dono.spaceId, membro.email, 'viewer');
    expect(jaMembro.status).toBe(409);
    expect(jaMembro.body.code).toBe('ALREADY_MEMBER');

    const emailInvalido = await invite(app, dono.accessToken, dono.spaceId, 'nao-e-email', 'viewer');
    expect(emailInvalido.status).toBe(400);

    const criado = await invite(app, dono.accessToken, dono.spaceId, 'futuro@scf.test', 'viewer');
    const revogado = await api(app)
      .delete(`${invitesUrl(dono.spaceId)}/${criado.body.invite.id}`)
      .set(auth(dono.accessToken));
    expect(revogado.status).toBe(204);

    const revogarDeNovo = await api(app)
      .delete(`${invitesUrl(dono.spaceId)}/${criado.body.invite.id}`)
      .set(auth(dono.accessToken));
    expect(revogarDeNovo.status).toBe(400);
    expect(revogarDeNovo.body.code).toBe('INVITE_NOT_PENDING');

    const tokenDesconhecido = await accept(app, dono.accessToken, 'token-que-nao-existe');
    expect(tokenDesconhecido.status).toBe(400);
    expect(tokenDesconhecido.body.code).toBe('INVITE_INVALID');
  });

  it('nega convite, alteracao e remocao para papeis sem permissao', async () => {
    const dono = await bootstrapUser(app);
    const leitor = await registerAndJoin(app, dono.accessToken, dono.spaceId, 'viewer');
    const donoId = await memberIdFor(app, dono.accessToken, dono.spaceId, dono.email);

    // Leitura de membros continua permitida.
    expect((await listMembers(app, leitor.accessToken, dono.spaceId)).status).toBe(200);

    expect((await listInvites(app, leitor.accessToken, dono.spaceId)).status).toBe(403);
    expect((await invite(app, leitor.accessToken, dono.spaceId, 'x@scf.test', 'viewer')).status).toBe(403);

    const mudar = await api(app)
      .patch(`${membersUrl(dono.spaceId)}/${donoId}`)
      .set(auth(leitor.accessToken))
      .send({ role: 'viewer' });
    expect(mudar.status).toBe(403);

    const remover = await api(app)
      .delete(`${membersUrl(dono.spaceId)}/${donoId}`)
      .set(auth(leitor.accessToken));
    expect(remover.status).toBe(403);
  });

  it('isola os espacos: quem nao e membro recebe 403 em membros e convites', async () => {
    const dono = await bootstrapUser(app);
    const estranho = await bootstrapUser(app);

    expect((await listMembers(app, estranho.accessToken, dono.spaceId)).status).toBe(403);
    expect((await listInvites(app, estranho.accessToken, dono.spaceId)).status).toBe(403);
    expect((await invite(app, estranho.accessToken, dono.spaceId, 'x@scf.test', 'viewer')).status).toBe(403);
  });
});

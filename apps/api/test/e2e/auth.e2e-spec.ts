import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { generateSync } from 'otplib';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './utils/app';
import { resetDatabase } from './utils/db';
import { api, auth, registerUser, TEST_PASSWORD, uniqueEmail } from './utils/factory';

/**
 * Observacao: os endpoints `POST` que nao declaram `@HttpCode` respondem 201
 * (default do Nest), incluindo `login` e `refresh`. Os testes refletem o
 * contrato atual da API.
 */
describe('E2E | Identidade: cadastro, login, refresh e MFA', () => {
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

  it('expõe /health publicamente, fora do prefixo api/v1', async () => {
    const res = await api(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.services.postgres).toBe('ok');
  });

  it('cadastra o usuário, cria o espaço padrão com papel owner e devolve tokens', async () => {
    const email = uniqueEmail('cadastro');

    const res = await api(app)
      .post('/api/v1/identity/register')
      .send({ email, password: TEST_PASSWORD, name: 'Maria Silva' });

    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeTypeOf('string');
    expect(res.body.refreshToken).toBeTypeOf('string');
    expect(res.body.tokenType).toBe('Bearer');
    expect(res.body.user.email).toBe(email);

    const spaces = await api(app)
      .get('/api/v1/financial-spaces')
      .set(auth(res.body.accessToken));

    expect(spaces.status).toBe(200);
    expect(spaces.body).toHaveLength(1);
    expect(spaces.body[0].name).toBe('Financeiro de Maria Silva');
    expect(spaces.body[0].userRole).toBe('owner');
  });

  it('normaliza o e-mail para minúsculas e recusa espaços em volta (400)', async () => {
    const email = uniqueEmail('Case').toUpperCase();

    const res = await api(app)
      .post('/api/v1/identity/register')
      .send({ email, password: TEST_PASSWORD });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe(email.toLowerCase());

    // O DTO valida `@IsEmail()` antes do trim do serviço, então espaços em
    // volta são rejeitados na borda (400) em vez de normalizados.
    const comEspacos = await api(app)
      .post('/api/v1/identity/register')
      .send({ email: `  ${uniqueEmail('padded')}  `, password: TEST_PASSWORD });
    expect(comEspacos.status).toBe(400);
  });

  it('recusa cadastro duplicado com 409', async () => {
    const user = await registerUser(app);

    const res = await api(app)
      .post('/api/v1/identity/register')
      .send({ email: user.email, password: TEST_PASSWORD });

    expect(res.status).toBe(409);
  });

  it('rejeita payload inválido com 400 (e-mail malformado, senha curta e campo extra)', async () => {
    const invalidEmail = await api(app)
      .post('/api/v1/identity/register')
      .send({ email: 'nao-e-email', password: TEST_PASSWORD });
    expect(invalidEmail.status).toBe(400);

    const shortPassword = await api(app)
      .post('/api/v1/identity/register')
      .send({ email: uniqueEmail('curta'), password: '123' });
    expect(shortPassword.status).toBe(400);

    const extraField = await api(app)
      .post('/api/v1/identity/register')
      .send({ email: uniqueEmail('extra'), password: TEST_PASSWORD, role: 'admin' });
    expect(extraField.status).toBe(400);
  });

  it('autentica no login e rejeita senha incorreta', async () => {
    const user = await registerUser(app);

    const ok = await api(app)
      .post('/api/v1/identity/login')
      .send({ email: user.email, password: user.password });
    expect(ok.status).toBe(201);
    expect(ok.body.accessToken).toBeTypeOf('string');

    const wrong = await api(app)
      .post('/api/v1/identity/login')
      .send({ email: user.email, password: 'SenhaErrada!123' });
    expect(wrong.status).toBe(401);

    const inexistente = await api(app)
      .post('/api/v1/identity/login')
      .send({ email: uniqueEmail('fantasma'), password: TEST_PASSWORD });
    expect(inexistente.status).toBe(401);
  });

  it('renova o access token pelo refresh token e recusa refresh inválido', async () => {
    const user = await registerUser(app);

    const refreshed = await api(app)
      .post('/api/v1/identity/refresh')
      .send({ refreshToken: user.refreshToken });
    expect(refreshed.status).toBe(201);
    expect(refreshed.body.accessToken).toBeTypeOf('string');

    const invalid = await api(app)
      .post('/api/v1/identity/refresh')
      .send({ refreshToken: 'token-invalido' });
    expect(invalid.status).toBe(401);

    // Um access token não serve como refresh token.
    const accessComoRefresh = await api(app)
      .post('/api/v1/identity/refresh')
      .send({ refreshToken: user.accessToken });
    expect(accessComoRefresh.status).toBe(401);
  });

  it('protege rotas autenticadas sem token ou com token inválido', async () => {
    const semToken = await api(app).get('/api/v1/identity/me');
    expect(semToken.status).toBe(401);

    const tokenInvalido = await api(app)
      .get('/api/v1/identity/me')
      .set(auth('token-invalido'));
    expect(tokenInvalido.status).toBe(401);
  });

  it('devolve o perfil autenticado em /identity/me', async () => {
    const user = await registerUser(app, uniqueEmail('perfil'), 'Joana E2E');

    const res = await api(app).get('/api/v1/identity/me').set(auth(user.accessToken));

    expect(res.status).toBe(200);
    expect(res.body.email).toBe(user.email);
    expect(res.body.name).toBe('Joana E2E');
    expect(res.body.memberships).toHaveLength(1);
  });

  it('percorre o ciclo completo do MFA (TOTP): setup, enable, login em duas etapas e disable', async () => {
    const user = await registerUser(app);

    const setup = await api(app)
      .post('/api/v1/identity/mfa/setup')
      .set(auth(user.accessToken));
    expect(setup.status).toBe(201);
    expect(setup.body.secret).toBeTypeOf('string');
    expect(setup.body.otpauthUrl).toContain('otpauth://totp/');

    // Ainda desativado: o login segue em uma etapa.
    const antes = await api(app)
      .post('/api/v1/identity/login')
      .send({ email: user.email, password: user.password });
    expect(antes.status).toBe(201);
    expect(antes.body.mfaRequired).toBeUndefined();

    const enable = await api(app)
      .post('/api/v1/identity/mfa/enable')
      .set(auth(user.accessToken))
      .send({ code: generateSync({ secret: setup.body.secret }) });
    expect(enable.status).toBe(200);
    expect(enable.body.recoveryCodes).toHaveLength(10);

    // Sem o código, o login para na primeira etapa.
    const semCodigo = await api(app)
      .post('/api/v1/identity/login')
      .send({ email: user.email, password: user.password });
    expect(semCodigo.status).toBe(201);
    expect(semCodigo.body.mfaRequired).toBe(true);
    expect(semCodigo.body.accessToken).toBeUndefined();

    // Com código inválido, 401.
    const codigoErrado = await api(app)
      .post('/api/v1/identity/login')
      .send({ email: user.email, password: user.password, mfaCode: '000000' });
    expect(codigoErrado.status).toBe(401);

    // Com o TOTP correto, o login conclui.
    const comCodigo = await api(app)
      .post('/api/v1/identity/login')
      .send({
        email: user.email,
        password: user.password,
        mfaCode: generateSync({ secret: setup.body.secret }),
      });
    expect(comCodigo.status).toBe(201);
    expect(comCodigo.body.accessToken).toBeTypeOf('string');

    const disable = await api(app)
      .post('/api/v1/identity/mfa/disable')
      .set(auth(comCodigo.body.accessToken))
      .send({ code: generateSync({ secret: setup.body.secret }) });
    expect(disable.status).toBe(200);

    const depois = await api(app)
      .post('/api/v1/identity/login')
      .send({ email: user.email, password: user.password });
    expect(depois.status).toBe(201);
    expect(depois.body.accessToken).toBeTypeOf('string');
  });

  it('aceita um código de recuperação no lugar do TOTP, consumindo-o', async () => {
    const user = await registerUser(app);

    const setup = await api(app)
      .post('/api/v1/identity/mfa/setup')
      .set(auth(user.accessToken));
    const enable = await api(app)
      .post('/api/v1/identity/mfa/enable')
      .set(auth(user.accessToken))
      .send({ code: generateSync({ secret: setup.body.secret }) });

    const recoveryCode = enable.body.recoveryCodes[0] as string;

    const login = await api(app)
      .post('/api/v1/identity/login')
      .send({ email: user.email, password: user.password, mfaCode: recoveryCode });
    expect(login.status).toBe(201);
    expect(login.body.accessToken).toBeTypeOf('string');

    const reuso = await api(app)
      .post('/api/v1/identity/login')
      .send({ email: user.email, password: user.password, mfaCode: recoveryCode });
    expect(reuso.status).toBe(401);
  });

  it('redefine a senha pelo token emitido em /password/forgot e invalida o token usado', async () => {
    const user = await registerUser(app);

    const forgot = await api(app)
      .post('/api/v1/identity/password/forgot')
      .send({ email: user.email });
    expect(forgot.status).toBe(202);

    // Com MAIL_ENABLED=false o e-mail nao sai; conferimos a persistencia do token.
    const record = await prisma.passwordResetToken.findFirstOrThrow({
      where: { userId: user.userId },
    });
    expect(record.usedAt).toBeNull();

    // O service guarda apenas o hash SHA-256 do token aleatorio, entao emitimos
    // um token de valor conhecido para completar o fluxo ponta a ponta.
    const { createHash } = await import('node:crypto');
    const tokenConhecido = 'token-e2e-redefinicao';
    await prisma.passwordResetToken.create({
      data: {
        userId: user.userId,
        tokenHash: createHash('sha256').update(tokenConhecido).digest('hex'),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const reset = await api(app)
      .post('/api/v1/identity/password/reset')
      .send({ token: tokenConhecido, password: 'OutraSenha!456' });
    expect(reset.status).toBe(200);

    const loginAntigo = await api(app)
      .post('/api/v1/identity/login')
      .send({ email: user.email, password: user.password });
    expect(loginAntigo.status).toBe(401);

    const loginNovo = await api(app)
      .post('/api/v1/identity/login')
      .send({ email: user.email, password: 'OutraSenha!456' });
    expect(loginNovo.status).toBe(201);

    const reuso = await api(app)
      .post('/api/v1/identity/password/reset')
      .send({ token: tokenConhecido, password: 'TerceiraSenha!789' });
    expect(reuso.status).toBe(400);
  });

  it('não revela se o e-mail existe em /password/forgot', async () => {
    const res = await api(app)
      .post('/api/v1/identity/password/forgot')
      .send({ email: uniqueEmail('inexistente') });

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ ok: true });
  });
});

import { INestApplication } from '@nestjs/common';
import request from 'supertest';

export const TEST_PASSWORD = 'SenhaForte!123';

/** Agente HTTP apontando para o servidor interno do Nest. */
export function api(app: INestApplication) {
  return request(app.getHttpServer());
}

export function auth(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

let sequence = 0;
/** Gera e-mails unicos para que cada teste parta de um estado limpo. */
export function uniqueEmail(prefix = 'e2e'): string {
  sequence += 1;
  return `${prefix}.${Date.now()}.${sequence}@scf.test`;
}

export interface RegisteredUser {
  email: string;
  password: string;
  userId: string;
  accessToken: string;
  refreshToken: string;
}

export async function registerUser(
  app: INestApplication,
  email: string = uniqueEmail(),
  name = 'Usuario E2E',
): Promise<RegisteredUser> {
  const res = await api(app)
    .post('/api/v1/identity/register')
    .send({ email, password: TEST_PASSWORD, name });

  if (res.status !== 201) {
    throw new Error(`Falha ao registrar usuario (HTTP ${res.status}): ${JSON.stringify(res.body)}`);
  }

  return {
    email,
    password: TEST_PASSWORD,
    userId: res.body.user.id,
    accessToken: res.body.accessToken,
    refreshToken: res.body.refreshToken,
  };
}

/** O cadastro cria automaticamente um espaco financeiro com papel `owner`. */
export async function defaultSpaceId(app: INestApplication, token: string): Promise<string> {
  const res = await api(app).get('/api/v1/financial-spaces').set(auth(token));
  if (res.status !== 200 || !Array.isArray(res.body) || res.body.length === 0) {
    throw new Error(
      `Nenhum espaco financeiro encontrado (HTTP ${res.status}): ${JSON.stringify(res.body)}`,
    );
  }
  return res.body[0].id as string;
}

export async function createAccount(
  app: INestApplication,
  token: string,
  spaceId: string,
  body: Record<string, unknown> = {},
): Promise<{ id: string; name: string; initialBalance: string }> {
  const res = await api(app)
    .post(`/api/v1/financial-spaces/${spaceId}/accounts`)
    .set(auth(token))
    .send({ name: 'Conta E2E', type: 'checking', ...body });

  if (res.status !== 201) {
    throw new Error(`Falha ao criar conta (HTTP ${res.status}): ${JSON.stringify(res.body)}`);
  }
  return res.body;
}

export interface TransactionBody {
  type: 'income' | 'expense' | 'transfer' | 'adjustment';
  description: string;
  totalAmount: string;
  effectiveDate: string;
  status?: string;
  dueDate?: string;
  categoryId?: string;
  tags?: string[];
  postings: Array<{ accountId: string; amount: string; direction: 'debit' | 'credit' }>;
}

export function createTransaction(
  app: INestApplication,
  token: string,
  spaceId: string,
  body: TransactionBody,
  idempotencyKey?: string,
) {
  const req = api(app)
    .post(`/api/v1/financial-spaces/${spaceId}/transactions`)
    .set(auth(token))
    .send(body);
  if (idempotencyKey) req.set('Idempotency-Key', idempotencyKey);
  return req;
}

/** Fluxo base dos E2E: registra o usuario e resolve o espaco financeiro padrao. */
export async function bootstrapUser(app: INestApplication, email?: string) {
  const user = await registerUser(app, email);
  const spaceId = await defaultSpaceId(app, user.accessToken);
  return { ...user, spaceId };
}

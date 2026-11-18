import { APIRequestContext, request } from '@playwright/test';

/**
 * Origem da API (sem o prefixo). O `APIRequestContext` do Playwright resolve as
 * URLs relativas com `new URL(path, baseURL)`; como o prefixo `api/v1` faz parte
 * do path, ele seria descartado se ficasse no `baseURL`. Por isso o prefixo e
 * aplicado em cada chamada.
 */
export const API_ORIGIN = process.env.E2E_API_URL ?? 'http://localhost:3001';
export const API_PREFIX = '/api/v1';
export const TEST_PASSWORD = 'SenhaForte!123';

/** Fuso usado pelo dashboard; precisa casar com `use.timezoneId` do Playwright. */
const DASHBOARD_TZ = 'America/Sao_Paulo';

let sequence = 0;
/** E-mails únicos para que cada teste parta de um espaço financeiro limpo. */
export function uniqueEmail(prefix = 'web.e2e'): string {
  sequence += 1;
  return `${prefix}.${Date.now()}.${sequence}@scf.test`;
}

/** Dia do mês corrente no fuso do dashboard, no formato `YYYY-MM-DD`. */
function currentMonthDay(day: number): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: DASHBOARD_TZ,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  const year = parts.find((p) => p.type === 'year')!.value;
  const month = parts.find((p) => p.type === 'month')!.value;
  return `${year}-${month}-${String(day).padStart(2, '0')}`;
}

export interface SeededUser {
  email: string;
  password: string;
  accessToken: string;
  spaceId: string;
  accountId: string;
}

export interface SeedOptions {
  /** Receita confirmada lançada no mês corrente (ex.: `1000.00`). */
  income?: string;
  /** Despesa confirmada lançada no mês corrente (ex.: `250.50`). */
  expense?: string;
  incomeDescription?: string;
  expenseDescription?: string;
}

interface TransactionBody {
  type: 'income' | 'expense';
  description: string;
  totalAmount: string;
  effectiveDate: string;
  postings: Array<{ accountId: string; amount: string; direction: 'debit' | 'credit' }>;
}

async function createTransaction(
  api: APIRequestContext,
  spaceId: string,
  token: string,
  body: TransactionBody,
): Promise<void> {
  const res = await api.post(`${API_PREFIX}/financial-spaces/${spaceId}/transactions`, {
    headers: { authorization: `Bearer ${token}` },
    data: body,
  });
  if (res.status() !== 201) {
    throw new Error(`Falha ao criar transação (HTTP ${res.status()}): ${await res.text()}`);
  }
}

/**
 * Cria um usuário novo pela API (mais o espaço padrão e uma conta) e,
 * opcionalmente, lançamentos confirmados no mês corrente para alimentar o
 * dashboard. Usado para dar dados determinísticos às asserções da UI.
 */
export async function seedUser(options: SeedOptions = {}): Promise<SeededUser> {
  const api = await request.newContext({ baseURL: API_ORIGIN });
  try {
    const email = uniqueEmail();

    const register = await api.post(`${API_PREFIX}/identity/register`, {
      data: { email, password: TEST_PASSWORD, name: 'Usuario Web E2E' },
    });
    if (register.status() !== 201) {
      throw new Error(`Falha no cadastro (HTTP ${register.status()}): ${await register.text()}`);
    }
    const session = (await register.json()) as { accessToken: string };
    const token = session.accessToken;
    const headers = { authorization: `Bearer ${token}` };

    const spaces = await api.get(`${API_PREFIX}/financial-spaces`, { headers });
    const spaceId = ((await spaces.json()) as Array<{ id: string }>)[0].id;

    const account = await api.post(`${API_PREFIX}/financial-spaces/${spaceId}/accounts`, {
      headers,
      data: { name: 'Conta E2E', type: 'checking' },
    });
    const accountId = ((await account.json()) as { id: string }).id;

    if (options.income) {
      await createTransaction(api, spaceId, token, {
        type: 'income',
        description: options.incomeDescription ?? 'Salário E2E',
        totalAmount: options.income,
        effectiveDate: currentMonthDay(5),
        postings: [{ accountId, amount: options.income, direction: 'debit' }],
      });
    }

    if (options.expense) {
      await createTransaction(api, spaceId, token, {
        type: 'expense',
        description: options.expenseDescription ?? 'Aluguel E2E',
        totalAmount: options.expense,
        effectiveDate: currentMonthDay(10),
        postings: [{ accountId, amount: options.expense, direction: 'credit' }],
      });
    }

    return { email, password: TEST_PASSWORD, accessToken: token, spaceId, accountId };
  } finally {
    await api.dispose();
  }
}

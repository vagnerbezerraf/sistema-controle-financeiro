const API_ORIGIN = process.env.E2E_API_URL ?? 'http://127.0.0.1:3001';
const API_PREFIX = '/api/v1';

export const TEST_PASSWORD = 'SenhaForte!123';

let sequence = 0;

/** E-mails unicos para que cada teste comece com um espaco financeiro limpo. */
export function uniqueEmail(prefix = 'desktop.e2e'): string {
  sequence += 1;
  return `${prefix}.${Date.now()}.${sequence}@scf.test`;
}

/**
 * Dia do mes corrente no fuso local da maquina. O dashboard do desktop monta a
 * competencia com o `Date` do WebView2, que usa o fuso do sistema — por isso o
 * seed nao pode fixar outro fuso.
 */
function currentMonthDay(day: number): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${String(day).padStart(2, '0')}`;
}

export interface SeededUser {
  email: string;
  password: string;
  accessToken: string;
  spaceId: string;
  accountId: string;
}

export interface SeedOptions {
  /** Receita confirmada lancada no mes corrente (ex.: `1000.00`). */
  income?: string;
  /** Despesa confirmada lancada no mes corrente (ex.: `250.50`). */
  expense?: string;
  incomeDescription?: string;
  expenseDescription?: string;
}

async function request<T>(method: string, endpoint: string, options: { token?: string; json?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  if (options.json !== undefined) headers['content-type'] = 'application/json';

  const res = await fetch(`${API_ORIGIN}${API_PREFIX}${endpoint}`, {
    method,
    headers,
    body: options.json !== undefined ? JSON.stringify(options.json) : undefined,
  });
  if (!res.ok) {
    throw new Error(`${method} ${endpoint} -> HTTP ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as T;
}

async function createTransaction(
  spaceId: string,
  token: string,
  body: {
    type: 'income' | 'expense';
    description: string;
    totalAmount: string;
    effectiveDate: string;
    postings: Array<{ accountId: string; amount: string; direction: 'debit' | 'credit' }>;
  },
): Promise<void> {
  await request('POST', `/financial-spaces/${spaceId}/transactions`, { token, json: body });
}

/**
 * Cria um usuario novo pela API (com espaco padrao e uma conta) e,
 * opcionalmente, lancamentos confirmados no mes corrente para dar dados
 * deterministicos as assercoes da UI.
 */
export async function seedUser(options: SeedOptions = {}): Promise<SeededUser> {
  const email = uniqueEmail();

  const session = await request<{ accessToken: string }>('POST', '/identity/register', {
    json: { email, password: TEST_PASSWORD, name: 'Usuario Desktop E2E' },
  });
  const token = session.accessToken;

  const spaces = await request<Array<{ id: string }>>('GET', '/financial-spaces', { token });
  const spaceId = spaces[0].id;

  const account = await request<{ id: string }>('POST', `/financial-spaces/${spaceId}/accounts`, {
    token,
    json: { name: 'Conta E2E', type: 'checking' },
  });
  const accountId = account.id;

  if (options.income) {
    await createTransaction(spaceId, token, {
      type: 'income',
      description: options.incomeDescription ?? 'Salario E2E',
      totalAmount: options.income,
      effectiveDate: currentMonthDay(5),
      postings: [{ accountId, amount: options.income, direction: 'debit' }],
    });
  }

  if (options.expense) {
    await createTransaction(spaceId, token, {
      type: 'expense',
      description: options.expenseDescription ?? 'Aluguel E2E',
      totalAmount: options.expense,
      effectiveDate: currentMonthDay(10),
      postings: [{ accountId, amount: options.expense, direction: 'credit' }],
    });
  }

  return { email, password: TEST_PASSWORD, accessToken: token, spaceId, accountId };
}

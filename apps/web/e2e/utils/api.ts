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
export function currentMonthDay(day: number): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: DASHBOARD_TZ,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  const year = parts.find((p) => p.type === 'year')!.value;
  const month = parts.find((p) => p.type === 'month')!.value;
  return `${year}-${month}-${String(day).padStart(2, '0')}`;
}

/**
 * Dia (UTC) deslocado em N dias a partir de hoje, no formato `YYYY-MM-DD`.
 * A API classifica os alertas pela data UTC, então os testes de vencimento
 * usam o mesmo referencial.
 */
export function utcDayOffset(days: number): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days));
  return d.toISOString().slice(0, 10);
}

export interface SeededUser {
  email: string;
  password: string;
  accessToken: string;
  spaceId: string;
  accountId: string;
  cardId?: string;
  cardName?: string;
  cardAccountId?: string;
}

export interface SeedOptions {
  /** Receita confirmada lançada no mês corrente (ex.: `1000.00`). */
  income?: string;
  /** Despesa confirmada lançada no mês corrente (ex.: `250.50`). */
  expense?: string;
  incomeDescription?: string;
  expenseDescription?: string;
  /** Etiquetas aplicadas à receita semeada. */
  incomeTags?: string[];
  /** Etiquetas aplicadas à despesa semeada. */
  expenseTags?: string[];
  /** Cartão de crédito criado no espaço financeiro. */
  creditCard?: { name: string; limit?: string; closingDay?: number; dueDay?: number };
  /** Compra lançada na conta técnica do cartão (exige `creditCard`). */
  purchase?: string;
  /** Contas a pagar/receber avulsas. */
  obligations?: Array<{ type: 'expense' | 'income'; description: string; amount: string; dueDate: string }>;
  /** Extratos CSV importados e aplicados (gera um lote por item). */
  imports?: Array<{ csv: string; fileName?: string }>;
  /** Recorrências; cada uma materializa as previsões até o horizonte informado. */
  recurrences?: Array<{
    type: 'expense' | 'income';
    description: string;
    amount: string;
    frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
    interval?: number;
    startDate: string;
    generateUpTo?: string;
    occurrencesLimit?: number;
  }>;
}

interface TransactionBody {
  type: 'income' | 'expense';
  description: string;
  totalAmount: string;
  effectiveDate: string;
  tags?: string[];
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

/** Cria um usuário novo pela API e devolve a sessão e o espaço padrão. */
export async function registerViaApi(prefix = 'web.e2e.convidado'): Promise<SeededUser> {
  const api = await request.newContext({ baseURL: API_ORIGIN });
  try {
    const email = uniqueEmail(prefix);
    const register = await api.post(`${API_PREFIX}/identity/register`, {
      data: { email, password: TEST_PASSWORD, name: 'Convidado Web E2E' },
    });
    if (register.status() !== 201) {
      throw new Error(`Falha no cadastro (HTTP ${register.status()}): ${await register.text()}`);
    }
    const session = (await register.json()) as { accessToken: string };
    const headers = { authorization: `Bearer ${session.accessToken}` };

    const spaces = await api.get(`${API_PREFIX}/financial-spaces`, { headers });
    const spaceId = ((await spaces.json()) as Array<{ id: string }>)[0].id;

    const account = await api.post(`${API_PREFIX}/financial-spaces/${spaceId}/accounts`, {
      headers,
      data: { name: 'Conta E2E', type: 'checking' },
    });
    const accountId = ((await account.json()) as { id: string }).id;

    return { email, password: TEST_PASSWORD, accessToken: session.accessToken, spaceId, accountId };
  } finally {
    await api.dispose();
  }
}

export interface InvitedMember {
  inviteId: string;
  token: string;
  acceptUrl: string;
}

/** Convida um e-mail para o espaço e devolve o token/link do convite. */
export async function inviteMemberViaApi(
  ownerToken: string,
  spaceId: string,
  email: string,
  role: 'admin' | 'contributor' | 'viewer' = 'contributor',
): Promise<InvitedMember> {
  const api = await request.newContext({ baseURL: API_ORIGIN });
  try {
    const res = await api.post(`${API_PREFIX}/financial-spaces/${spaceId}/invites`, {
      headers: { authorization: `Bearer ${ownerToken}` },
      data: { email, role },
    });
    if (res.status() !== 201) {
      throw new Error(`Falha ao convidar (HTTP ${res.status()}): ${await res.text()}`);
    }
    const body = (await res.json()) as { invite: { id: string }; token: string; acceptUrl: string };
    return { inviteId: body.invite.id, token: body.token, acceptUrl: body.acceptUrl };
  } finally {
    await api.dispose();
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
        tags: options.incomeTags,
        postings: [{ accountId, amount: options.income, direction: 'debit' }],
      });
    }

    if (options.expense) {
      await createTransaction(api, spaceId, token, {
        type: 'expense',
        description: options.expenseDescription ?? 'Aluguel E2E',
        totalAmount: options.expense,
        effectiveDate: currentMonthDay(10),
        tags: options.expenseTags,
        postings: [{ accountId, amount: options.expense, direction: 'credit' }],
      });
    }

    let cardId: string | undefined;
    let cardName: string | undefined;
    let cardAccountId: string | undefined;
    if (options.creditCard) {
      const cardRes = await api.post(`${API_PREFIX}/financial-spaces/${spaceId}/credit-cards`, {
        headers,
        data: {
          name: options.creditCard.name,
          limit: options.creditCard.limit ?? '5000.00',
          closingDay: options.creditCard.closingDay ?? 25,
          dueDay: options.creditCard.dueDay ?? 5,
        },
      });
      if (cardRes.status() !== 201) {
        throw new Error(`Falha ao criar cartão (HTTP ${cardRes.status()}): ${await cardRes.text()}`);
      }
      const card = (await cardRes.json()) as { id: string; name: string; accountId: string };
      cardId = card.id;
      cardName = card.name;
      cardAccountId = card.accountId;

      if (options.purchase) {
        await createTransaction(api, spaceId, token, {
          type: 'expense',
          description: 'Compra cartão E2E',
          totalAmount: options.purchase,
          effectiveDate: currentMonthDay(5),
          postings: [{ accountId: card.accountId, amount: options.purchase, direction: 'credit' }],
        });
      }
    }

    for (const obligation of options.obligations ?? []) {
      const res = await api.post(`${API_PREFIX}/financial-spaces/${spaceId}/obligations`, {
        headers,
        data: obligation,
      });
      if (res.status() !== 201) {
        throw new Error(`Falha ao criar conta (HTTP ${res.status()}): ${await res.text()}`);
      }
    }

    for (const item of options.imports ?? []) {
      const previewRes = await api.post(`${API_PREFIX}/financial-spaces/${spaceId}/imports/preview`, {
        headers,
        data: { csv: item.csv, accountId, ...(item.fileName ? { fileName: item.fileName } : {}) },
      });
      if (previewRes.status() !== 201) {
        throw new Error(`Falha na previa da importacao (HTTP ${previewRes.status()}): ${await previewRes.text()}`);
      }
      const batchId = ((await previewRes.json()) as { batch: { id: string } }).batch.id;
      const commitRes = await api.post(`${API_PREFIX}/financial-spaces/${spaceId}/imports/${batchId}/commit`, {
        headers,
      });
      if (commitRes.status() !== 201) {
        throw new Error(`Falha ao aplicar a importacao (HTTP ${commitRes.status()}): ${await commitRes.text()}`);
      }
    }

    for (const rule of options.recurrences ?? []) {
      const { type, description, amount, frequency, interval, startDate, generateUpTo, occurrencesLimit } = rule;
      const res = await api.post(`${API_PREFIX}/financial-spaces/${spaceId}/recurrences`, {
        headers,
        data: {
          frequency,
          startDate,
          template: { type, description, amount },
          ...(interval ? { interval } : {}),
          ...(generateUpTo ? { generateUpTo } : {}),
          ...(occurrencesLimit ? { occurrencesLimit } : {}),
        },
      });
      if (res.status() !== 201) {
        throw new Error(`Falha ao criar recorrência (HTTP ${res.status()}): ${await res.text()}`);
      }
    }

    return {
      email,
      password: TEST_PASSWORD,
      accessToken: token,
      spaceId,
      accountId,
      cardId,
      cardName,
      cardAccountId,
    };
  } finally {
    await api.dispose();
  }
}

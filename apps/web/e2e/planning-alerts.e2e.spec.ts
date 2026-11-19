import { expect, request, test } from '@playwright/test';
import { API_ORIGIN, API_PREFIX, seedUser, utcDayOffset } from './utils/api';
import { loginViaUi } from './utils/ui';

/** Primeiro e ultimo dia do mes corrente em UTC (janela padrao do orcamento). */
function utcMonthRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

/** Cria um orcamento geral (todas as despesas) no mes corrente e devolve o id. */
async function createGeneralBudget(
  token: string,
  spaceId: string,
  amountLimit: string,
): Promise<string> {
  const api = await request.newContext({ baseURL: API_ORIGIN });
  try {
    const { from, to } = utcMonthRange();
    const res = await api.post(`${API_PREFIX}/financial-spaces/${spaceId}/budgets`, {
      headers: { authorization: `Bearer ${token}` },
      data: { periodStart: from, periodEnd: to, amountLimit },
    });
    expect(res.status()).toBe(201);
    return ((await res.json()) as { id: string }).id;
  } finally {
    await api.dispose();
  }
}

/** Lanca uma receita confirmada na conta do espaco (efetiva ontem) via API. */
async function seedIncome(
  token: string,
  spaceId: string,
  accountId: string,
  amount: string,
): Promise<void> {
  const api = await request.newContext({ baseURL: API_ORIGIN });
  try {
    const res = await api.post(`${API_PREFIX}/financial-spaces/${spaceId}/transactions`, {
      headers: { authorization: `Bearer ${token}` },
      data: {
        type: 'income',
        description: 'Salario',
        totalAmount: amount,
        effectiveDate: utcDayOffset(-1),
        postings: [{ accountId, amount, direction: 'debit' }],
      },
    });
    expect(res.status()).toBe(201);
  } finally {
    await api.dispose();
  }
}

test.describe('Web · alertas de planejamento', () => {
  test('sinaliza o orcamento estourado na central de alertas', async ({ page }) => {
    const seeded = await seedUser({ expense: '250.00', expenseDescription: 'Mercado E2E' });
    const budgetId = await createGeneralBudget(seeded.accessToken, seeded.spaceId, '100.00');

    await loginViaUi(page, seeded.email, seeded.password);
    await page.goto('/app/alerts');

    await expect(page.getByTestId('alertas-planejamento')).toBeVisible();
    const alerta = page.getByTestId(`alertas-orcamento-${budgetId}`);
    await expect(alerta).toContainText('Estourado');
    await expect(alerta).toContainText('R$ 250,00 de R$ 100,00');
    await expect(alerta).toContainText('250%');
  });

  test('avisa quando o saldo projetado fica negativo', async ({ page }) => {
    const seeded = await seedUser({
      obligations: [
        { type: 'expense', description: 'Despesa grande', amount: '400.00', dueDate: utcDayOffset(3) },
      ],
    });
    await seedIncome(seeded.accessToken, seeded.spaceId, seeded.accountId, '100.00');

    await loginViaUi(page, seeded.email, seeded.password);
    await page.goto('/app/alerts');

    const aviso = page.getByTestId('alertas-saldo-negativo');
    await expect(aviso).toBeVisible();
    await expect(aviso).toContainText('-R$ 300,00');
  });

  test('mostra o estado vazio quando nao ha alertas de planejamento', async ({ page }) => {
    const seeded = await seedUser();

    await loginViaUi(page, seeded.email, seeded.password);
    await page.goto('/app/alerts');

    await expect(page.getByTestId('alertas-planejamento-vazio')).toBeVisible();
  });
});

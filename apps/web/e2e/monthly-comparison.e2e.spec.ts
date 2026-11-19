import { expect, request, test } from '@playwright/test';
import { API_ORIGIN, API_PREFIX, currentMonthDay, seedUser } from './utils/api';
import { loginViaUi } from './utils/ui';

/** Competencia (YYYY-MM) deslocada em N meses a partir do mes local corrente. */
function monthOffset(offset: number): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  const year = Number(parts.find((p) => p.type === 'year')!.value);
  const month = Number(parts.find((p) => p.type === 'month')!.value);
  const shifted = new Date(Date.UTC(year, month - 1 + offset, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`;
}

const dayIn = (month: string, day: number) => `${month}-${String(day).padStart(2, '0')}`;

/** Lanca um lancamento confirmado via API na data informada. */
async function seedTransaction(
  token: string,
  spaceId: string,
  accountId: string,
  type: 'income' | 'expense',
  amount: string,
  date: string,
): Promise<void> {
  const api = await request.newContext({ baseURL: API_ORIGIN });
  try {
    const res = await api.post(`${API_PREFIX}/financial-spaces/${spaceId}/transactions`, {
      headers: { authorization: `Bearer ${token}` },
      data: {
        type,
        description: `${type} ${amount}`,
        totalAmount: amount,
        effectiveDate: date,
        postings: [
          {
            accountId,
            amount,
            direction: type === 'income' ? 'debit' : 'credit',
          },
        ],
      },
    });
    expect(res.status()).toBe(201);
  } finally {
    await api.dispose();
  }
}

test.describe('Web · comparacoes mensais', () => {
  test('compara os totais do mes com o mes anterior', async ({ page }) => {
    const seeded = await seedUser();
    const previousMonth = monthOffset(-1);

    // Mes anterior: receita 1000, despesa 600 (liquido 400).
    await seedTransaction(seeded.accessToken, seeded.spaceId, seeded.accountId, 'income', '1000.00', dayIn(previousMonth, 10));
    await seedTransaction(seeded.accessToken, seeded.spaceId, seeded.accountId, 'expense', '600.00', dayIn(previousMonth, 15));
    // Mes corrente: receita 1200, despesa 900 (liquido 300).
    await seedTransaction(seeded.accessToken, seeded.spaceId, seeded.accountId, 'income', '1200.00', currentMonthDay(5));
    await seedTransaction(seeded.accessToken, seeded.spaceId, seeded.accountId, 'expense', '900.00', currentMonthDay(10));

    await loginViaUi(page, seeded.email, seeded.password);
    await page.goto('/app/reports');

    await expect(page.getByRole('heading', { name: 'Relatorios', exact: true })).toBeVisible();
    await expect(page.getByTestId('comparativo-mensal')).toBeVisible();

    const receitas = page.getByTestId('comparativo-receitas');
    await expect(receitas).toContainText('R$ 1.200,00');
    await expect(receitas).toContainText('R$ 1.000,00');
    await expect(page.getByTestId('comparativo-receitas-percentual')).toContainText('20,0%');

    await expect(page.getByTestId('comparativo-despesas-percentual')).toContainText('50,0%');

    const liquido = page.getByTestId('comparativo-liquido');
    await expect(liquido).toContainText('R$ 300,00');
    await expect(page.getByTestId('comparativo-liquido-percentual')).toContainText('-25,0%');
  });

  test('sinaliza percentual sem base quando nao ha mes anterior', async ({ page }) => {
    const seeded = await seedUser();
    await seedTransaction(seeded.accessToken, seeded.spaceId, seeded.accountId, 'income', '800.00', currentMonthDay(4));

    await loginViaUi(page, seeded.email, seeded.password);
    await page.goto('/app/reports');

    const receitas = page.getByTestId('comparativo-receitas');
    await expect(receitas).toContainText('R$ 800,00');
    await expect(page.getByTestId('comparativo-receitas-percentual')).toContainText('sem base');
  });

  test('mostra o estado vazio sem lancamentos nos dois meses', async ({ page }) => {
    const seeded = await seedUser();

    await loginViaUi(page, seeded.email, seeded.password);
    await page.goto('/app/reports');

    await expect(page.getByTestId('comparativo-vazio')).toBeVisible();
  });
});

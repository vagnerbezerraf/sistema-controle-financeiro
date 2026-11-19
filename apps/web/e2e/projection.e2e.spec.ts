import { expect, request, test } from '@playwright/test';
import { API_ORIGIN, API_PREFIX, seedUser, utcDayOffset } from './utils/api';
import { loginViaUi } from './utils/ui';

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

test.describe('Web · saldo projetado', () => {
  test('projeta o saldo somando as contas em aberto', async ({ page }) => {
    const seeded = await seedUser({
      obligations: [
        { type: 'expense', description: 'Aluguel previsto', amount: '300.00', dueDate: utcDayOffset(5) },
      ],
    });
    await seedIncome(seeded.accessToken, seeded.spaceId, seeded.accountId, '1000.00');

    await loginViaUi(page, seeded.email, seeded.password);
    await page.goto('/app/projection');

    await expect(page.getByRole('heading', { name: 'Saldo projetado', exact: true })).toBeVisible();
    await expect(page.getByTestId('projecao-saldo-atual')).toContainText('R$ 1.000,00');
    await expect(page.getByTestId('projecao-saldo-final')).toContainText('R$ 700,00');

    const ponto = page.getByTestId(`projecao-ponto-${utcDayOffset(5)}`);
    await expect(ponto).toContainText('R$ 300,00');
    await expect(page.getByTestId(`projecao-saldo-${utcDayOffset(5)}`)).toContainText('R$ 700,00');
  });

  test('avisa quando o saldo fica negativo no horizonte', async ({ page }) => {
    const seeded = await seedUser({
      obligations: [
        { type: 'expense', description: 'Despesa grande', amount: '400.00', dueDate: utcDayOffset(3) },
      ],
    });
    await seedIncome(seeded.accessToken, seeded.spaceId, seeded.accountId, '100.00');

    await loginViaUi(page, seeded.email, seeded.password);
    await page.goto('/app/projection');

    await expect(page.getByTestId('projecao-aviso-negativo')).toBeVisible();
    await expect(page.getByTestId('projecao-menor-saldo')).toContainText('-R$ 300,00');
  });

  test('mostra o estado vazio quando nao ha movimentos previstos', async ({ page }) => {
    const seeded = await seedUser();

    await loginViaUi(page, seeded.email, seeded.password);
    await page.goto('/app/projection');

    await expect(page.getByText('Nenhum movimento previsto no periodo.')).toBeVisible();
    await expect(page.getByTestId('projecao-saldo-atual')).toContainText('R$ 0,00');
  });
});

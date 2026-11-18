import { expect, test } from '@playwright/test';
import { seedUser } from './utils/api';
import { loginViaUi } from './utils/ui';

test.describe('Web · cartões e faturas', () => {
  test('cria um cartão pela interface', async ({ page }) => {
    const user = await seedUser();
    await loginViaUi(page, user.email, user.password);
    await page.goto('/app/cards');

    await expect(page.getByRole('heading', { name: 'Cartoes e faturas' })).toBeVisible();

    await page.getByTestId('novo-cartao').click();
    await page.getByTestId('cartao-nome').fill('Cartao UI E2E');
    await page.getByTestId('cartao-limite').fill('2500.00');
    await page.getByTestId('cartao-salvar').click();

    await expect(page.getByTestId('cartao-Cartao UI E2E')).toBeVisible();
  });

  test('agrupa compras em fatura e permite pagar por transferência', async ({ page }) => {
    const user = await seedUser({
      creditCard: { name: 'Cartao Fatura E2E', closingDay: 25, dueDay: 5 },
      purchase: '300.00',
    });
    await loginViaUi(page, user.email, user.password);
    await page.goto('/app/cards');

    await expect(page.getByTestId('cartao-Cartao Fatura E2E')).toBeVisible();

    // A compra é agrupada em uma fatura (o dia de fechamento depende do ciclo).
    const fatura = page.getByTestId(/^fatura-\d{4}-\d{2}-\d{2}$/);
    await expect(fatura).toBeVisible();
    await expect(fatura).toContainText('300,00');
    await expect(fatura).toContainText('Aberta');

    // Abre o painel de pagamento e quita o valor em aberto (padrão).
    await page.getByTestId(/^pagar-\d{4}-\d{2}-\d{2}$/).click();
    await expect(page.getByTestId('pagar-confirmar')).toBeVisible();
    await page.getByTestId('pagar-confirmar').click();

    await expect(fatura).toContainText('Paga');
    await expect(fatura).toContainText('aberto R$ 0,00');
  });
});

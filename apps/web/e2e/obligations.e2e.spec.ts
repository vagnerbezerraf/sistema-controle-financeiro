import { expect, test } from '@playwright/test';
import { seedUser } from './utils/api';
import { loginViaUi } from './utils/ui';

test.describe('Web · contas a pagar e receber', () => {
  test('cria uma conta avulsa pela interface', async ({ page }) => {
    const user = await seedUser();
    await loginViaUi(page, user.email, user.password);
    await page.goto('/app/obligations');

    await expect(page.getByRole('heading', { name: 'Contas a pagar e receber' })).toBeVisible();

    await page.getByTestId('nova-conta').click();
    await page.getByTestId('conta-descricao').fill('IPTU UI E2E');
    await page.getByTestId('conta-valor').fill('450.00');
    await page.getByTestId('conta-vencimento').fill('2099-01-10');
    await page.getByTestId('conta-salvar').click();

    const row = page.locator('li', { hasText: 'IPTU UI E2E' });
    await expect(row).toBeVisible();
    await expect(row).toContainText('R$ 450,00');
    await expect(row).toContainText('Em aberto');
  });

  test('cria uma recorrência mensal e materializa as previsões', async ({ page }) => {
    const user = await seedUser();
    await loginViaUi(page, user.email, user.password);
    await page.goto('/app/obligations');

    await page.getByTestId('nova-recorrencia').click();
    await page.getByTestId('recorrencia-descricao').fill('Aluguel UI E2E');
    await page.getByTestId('recorrencia-valor').fill('1800.00');
    await page.getByTestId('recorrencia-inicio').fill('2026-01-10');
    await page.getByTestId('recorrencia-horizonte').fill('2026-06-30');
    await page.getByTestId('recorrencia-salvar').click();

    // A regra aparece na lista de recorrências...
    const ruleRow = page.locator('li[data-testid^="regra-"]');
    await expect(ruleRow).toHaveCount(1);
    await expect(ruleRow).toContainText('Aluguel UI E2E');
    await expect(ruleRow).toContainText('mensal');
    // ...e cada ocorrência materializada vira uma conta marcada como recorrente.
    await expect(page.getByText('recorrente')).toHaveCount(6);
  });

  test('filtra somente as contas vencidas', async ({ page }) => {
    const user = await seedUser({
      obligations: [
        { type: 'expense', description: 'Conta vencida E2E', amount: '10.00', dueDate: '2020-01-05' },
        { type: 'expense', description: 'Conta futura E2E', amount: '20.00', dueDate: '2099-01-05' },
      ],
    });
    await loginViaUi(page, user.email, user.password);
    await page.goto('/app/obligations');

    await expect(page.getByText('Conta vencida E2E')).toBeVisible();
    await expect(page.getByText('Conta futura E2E')).toBeVisible();

    await page.getByTestId('filtro-vencidas').check();

    await expect(page.getByText('Conta vencida E2E')).toBeVisible();
    await expect(page.getByText('Conta futura E2E')).toHaveCount(0);
  });

  test('concilia uma conta com um lançamento confirmado', async ({ page }) => {
    const user = await seedUser({
      expense: '200.00',
      obligations: [{ type: 'expense', description: 'Luz E2E', amount: '200.00', dueDate: '2099-01-10' }],
    });
    await loginViaUi(page, user.email, user.password);
    await page.goto('/app/obligations');

    const row = page.locator('li', { hasText: 'Luz E2E' });
    await expect(row).toBeVisible();

    await row.getByRole('button', { name: 'Conciliar' }).click();
    await page.getByTestId('conciliar-confirmar').click();

    await expect(row.getByText('Conciliada')).toBeVisible();
  });
});

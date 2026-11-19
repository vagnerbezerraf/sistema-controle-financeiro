import { expect, test } from '@playwright/test';
import { seedUser } from './utils/api';
import { loginViaUi } from './utils/ui';

test.describe('Web · orçamentos', () => {
  test('cria um orçamento geral e mostra o consumo realizado', async ({ page }) => {
    const user = await seedUser({ expense: '250.00', expenseDescription: 'Mercado E2E' });
    await loginViaUi(page, user.email, user.password);
    await page.goto('/app/budgets');

    await expect(page.getByRole('heading', { name: 'Orcamentos' })).toBeVisible();

    await page.getByTestId('orcamento-novo').click();
    await page.getByTestId('orcamento-limite').fill('1000.00');
    await page.getByTestId('orcamento-salvar').click();

    const row = page.locator('li[data-testid^="orcamento-"]');
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('Geral (todas as despesas)');
    await expect(row).toContainText('R$ 250,00 de R$ 1.000,00');
    await expect(row).toContainText('Dentro do limite');
    await expect(page.getByTestId('orcamentos-saldo')).toContainText('R$ 750,00');
  });

  test('cria um orçamento por categoria sem consumo', async ({ page }) => {
    const user = await seedUser();
    await loginViaUi(page, user.email, user.password);
    await page.goto('/app/budgets');

    await page.getByTestId('orcamento-novo').click();
    await page.getByTestId('orcamento-categoria').selectOption({ label: 'Alimentacao' });
    await page.getByTestId('orcamento-limite').fill('500.00');
    await page.getByTestId('orcamento-salvar').click();

    const row = page.locator('li[data-testid^="orcamento-"]');
    await expect(row).toContainText('Alimentacao');
    await expect(row).toContainText('R$ 0,00 de R$ 500,00');
  });

  test('sinaliza estouro, permite editar o limite e remover o orçamento', async ({ page }) => {
    const user = await seedUser({ expense: '250.00', expenseDescription: 'Mercado E2E' });
    await loginViaUi(page, user.email, user.password);
    await page.goto('/app/budgets');

    await page.getByTestId('orcamento-novo').click();
    await page.getByTestId('orcamento-limite').fill('100.00');
    await page.getByTestId('orcamento-salvar').click();

    const row = page.locator('li[data-testid^="orcamento-"]');
    await expect(row).toContainText('Estourado');

    await row.getByRole('button', { name: 'Editar limite' }).click();
    await row.getByLabel('Novo limite').fill('500.00');
    await row.getByRole('button', { name: 'Salvar' }).click();

    await expect(row).toContainText('Dentro do limite');

    await row.getByRole('button', { name: 'Remover' }).click();
    await expect(page.getByText('Nenhum orcamento neste periodo')).toBeVisible();
  });
});

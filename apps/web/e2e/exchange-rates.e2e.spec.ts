import { expect, test } from '@playwright/test';
import { seedUser } from './utils/api';
import { loginViaUi } from './utils/ui';

test.describe('Web · taxas de cambio', () => {
  test('cria uma taxa pela interface e mostra na lista', async ({ page }) => {
    const user = await seedUser();
    await loginViaUi(page, user.email, user.password);
    await page.goto('/app/exchange-rates');

    await expect(page.getByRole('heading', { name: 'Taxas de cambio' })).toBeVisible();
    await expect(page.getByText('Nenhuma taxa cadastrada')).toBeVisible();

    await page.getByTestId('taxa-nova').click();
    await page.getByTestId('taxa-de').selectOption('USD');
    await page.getByTestId('taxa-para').selectOption('BRL');
    await page.getByTestId('taxa-valor').fill('5.2500');
    await page.getByTestId('taxa-fonte').fill('Banco Central');
    await page.getByTestId('taxa-salvar').click();

    const row = page.locator('li[data-testid^="taxa-item-"]');
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('USD');
    await expect(row).toContainText('BRL');
    await expect(row).toContainText('5.25');
    await expect(row).toContainText('Banco Central');
  });

  test('edita o valor da taxa e remove', async ({ page }) => {
    const user = await seedUser();
    await loginViaUi(page, user.email, user.password);
    await page.goto('/app/exchange-rates');

    await page.getByTestId('taxa-nova').click();
    await page.getByTestId('taxa-de').selectOption('USD');
    await page.getByTestId('taxa-para').selectOption('BRL');
    await page.getByTestId('taxa-valor').fill('5.0000');
    await page.getByTestId('taxa-salvar').click();

    const row = page.locator('li[data-testid^="taxa-item-"]');
    await expect(row).toContainText('5');

    await row.getByRole('button', { name: 'Editar' }).click();
    await row.locator('input').fill('6.1000');
    await row.getByRole('button', { name: 'Salvar' }).click();

    await expect(row).toContainText('6.1');

    await row.getByRole('button', { name: 'Remover' }).click();
    await expect(page.getByText('Nenhuma taxa cadastrada')).toBeVisible();
  });
});

import { expect, test } from '@playwright/test';
import { seedUser } from './utils/api';
import { loginViaUi } from './utils/ui';

test.describe('Web · metas', () => {
  test('cria uma meta, registra contribuicao e ajusta o alvo', async ({ page }) => {
    const user = await seedUser();
    await loginViaUi(page, user.email, user.password);
    await page.goto('/app/goals');

    await expect(page.getByRole('heading', { name: 'Metas', exact: true })).toBeVisible();

    await page.getByTestId('meta-nova').click();
    await page.getByTestId('meta-nome').fill('Reserva de emergencia');
    await page.getByTestId('meta-alvo').fill('1000.00');
    await page.getByTestId('meta-salvar').click();

    const row = page.locator('li[data-testid^="meta-"]');
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('Reserva de emergencia');
    await expect(row).toContainText('R$ 0,00 de R$ 1.000,00');
    await expect(row).toContainText('Em andamento');

    await row.getByRole('button', { name: 'Contribuir' }).click();
    await row.getByLabel('Valor da contribuicao').fill('250.00');
    await row.getByRole('button', { name: 'Registrar' }).click();

    await expect(row).toContainText('R$ 250,00 de R$ 1.000,00');
    await expect(page.getByTestId('metas-total-acumulado')).toContainText('R$ 250,00');

    await row.getByRole('button', { name: 'Editar alvo' }).click();
    await row.getByLabel('Novo alvo').fill('500.00');
    await row.getByRole('button', { name: 'Salvar' }).click();

    await expect(row).toContainText('R$ 250,00 de R$ 500,00');
  });

  test('marca a meta como atingida ao alcancar o alvo', async ({ page }) => {
    const user = await seedUser();
    await loginViaUi(page, user.email, user.password);
    await page.goto('/app/goals');

    await page.getByTestId('meta-nova').click();
    await page.getByTestId('meta-nome').fill('Viagem');
    await page.getByTestId('meta-alvo').fill('500.00');
    await page.getByTestId('meta-salvar').click();

    const row = page.locator('li[data-testid^="meta-"]');
    await row.getByRole('button', { name: 'Contribuir' }).click();
    await row.getByLabel('Valor da contribuicao').fill('500.00');
    await row.getByRole('button', { name: 'Registrar' }).click();

    await expect(row).toContainText('Atingida');
    await expect(row).toContainText('R$ 500,00 de R$ 500,00');
    await expect(row).toContainText('100,0%');
  });

  test('sinaliza meta atrasada e permite remover', async ({ page }) => {
    const user = await seedUser();
    await loginViaUi(page, user.email, user.password);
    await page.goto('/app/goals');

    await page.getByTestId('meta-nova').click();
    await page.getByTestId('meta-nome').fill('Curso de ingles');
    await page.getByTestId('meta-alvo').fill('2000.00');
    await page.getByTestId('meta-prazo').fill('2020-01-01');
    await page.getByTestId('meta-salvar').click();

    const row = page.locator('li[data-testid^="meta-"]');
    await expect(row).toContainText('Atrasada');

    await row.getByRole('button', { name: 'Remover' }).click();
    await expect(page.getByText('Nenhuma meta cadastrada')).toBeVisible();
  });
});

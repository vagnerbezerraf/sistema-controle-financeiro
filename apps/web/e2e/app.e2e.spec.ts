import { expect, test } from '@playwright/test';
import { seedUser } from './utils/api';
import { loginViaUi } from './utils/ui';

test.describe('Web · dashboard e lançamentos', () => {
  test('consolida no dashboard os totais do mês a partir de dados reais', async ({ page }) => {
    const user = await seedUser({ income: '1000.00', expense: '250.50' });
    await loginViaUi(page, user.email, user.password);

    // Receita 1000,00 − despesa 250,50 = saldo realizado 749,50.
    await expect(page.locator('.card', { hasText: 'Receitas no periodo' })).toContainText('1.000,00');
    await expect(page.locator('.card', { hasText: 'Despesas no periodo' })).toContainText('250,50');
    await expect(page.locator('.card', { hasText: 'Saldo realizado' })).toContainText('749,50');

    // Os lançamentos criados aparecem na lista de recentes.
    await expect(page.getByText('Salário E2E')).toBeVisible();
    await expect(page.getByText('Aluguel E2E')).toBeVisible();
  });

  test('lista os lançamentos do espaço financeiro', async ({ page }) => {
    const user = await seedUser({ income: '1000.00', expense: '250.50' });
    await loginViaUi(page, user.email, user.password);

    await page.goto('/app/transactions');

    await expect(page.getByRole('heading', { name: 'Lancamentos' })).toBeVisible();
    await expect(page.getByText('2 registros')).toBeVisible();
    await expect(page.getByText('Salário E2E')).toBeVisible();
    await expect(page.getByText('Aluguel E2E')).toBeVisible();
  });

  test('exibe e filtra lançamentos por etiqueta', async ({ page }) => {
    const user = await seedUser({
      income: '1000.00',
      incomeTags: ['viagem'],
      expense: '250.50',
      expenseTags: ['contas'],
    });
    await loginViaUi(page, user.email, user.password);
    await page.goto('/app/transactions');

    await expect(page.getByRole('heading', { name: 'Lancamentos' })).toBeVisible();
    // As etiquetas aparecem como badges clicáveis na coluna "Etiquetas".
    await expect(page.getByRole('button', { name: 'viagem' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'contas' })).toBeVisible();

    // Filtra pela etiqueta da receita: apenas o lançamento marcado permanece.
    await page.getByPlaceholder('Ex.: viagem').fill('viagem');
    await expect(page.getByText('1 registros')).toBeVisible();
    await expect(page.getByText('Salário E2E')).toBeVisible();
    await expect(page.getByText('Aluguel E2E')).toHaveCount(0);
  });

  test('exibe o espaço financeiro padrão do usuário na barra lateral', async ({ page }) => {
    const user = await seedUser();
    await loginViaUi(page, user.email, user.password);

    // O nome do espaço vive num <option> do seletor da barra lateral.
    const spaceSelect = page.locator('aside select');
    await expect(spaceSelect.locator('option')).toHaveText('Financeiro de Usuario Web E2E');
    await expect(spaceSelect).toHaveValue(user.spaceId);
  });
});

import { expect, test } from '@playwright/test';
import { seedUser } from './utils/api';
import { loginViaUi } from './utils/ui';

/** Cria uma regra pela interface, a partir da pagina ja aberta. */
async function createRuleViaUi(
  page: import('@playwright/test').Page,
  options: { name: string; category: string; pattern: string; type?: 'Despesa' | 'Receita' },
): Promise<void> {
  await page.getByTestId('regra-nova').click();
  await page.getByTestId('regra-nome').fill(options.name);
  await page.getByTestId('regra-categoria').selectOption({ label: options.category });
  await page.getByTestId('regra-padrao').fill(options.pattern);
  if (options.type) await page.getByTestId('regra-tipo').selectOption({ label: options.type });
  await page.getByTestId('regra-salvar').click();
}

test.describe('Web · regras de categorizacao', () => {
  test('cria uma regra pela interface e mostra na lista por precedencia', async ({ page }) => {
    const user = await seedUser();
    await loginViaUi(page, user.email, user.password);
    await page.goto('/app/categorization-rules');

    await expect(page.getByRole('heading', { name: 'Regras de categorizacao' })).toBeVisible();
    await expect(page.getByText('Nenhuma regra cadastrada')).toBeVisible();

    await createRuleViaUi(page, {
      name: 'Mercado',
      category: 'Alimentacao',
      pattern: 'mercado',
      type: 'Despesa',
    });

    const row = page.locator('li[data-testid^="regra-"]');
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('Mercado');
    await expect(row).toContainText('Alimentacao');
    await expect(row).toContainText('Despesa');
    await expect(row).toContainText('Contem "mercado"');
  });

  test('aplica as regras retroativamente aos lancamentos sem categoria', async ({ page }) => {
    const user = await seedUser({ expense: '250.00', expenseDescription: 'Mercado E2E' });
    await loginViaUi(page, user.email, user.password);
    await page.goto('/app/categorization-rules');

    await createRuleViaUi(page, {
      name: 'Mercado',
      category: 'Alimentacao',
      pattern: 'mercado',
      type: 'Despesa',
    });

    await page.getByTestId('regras-aplicar').click();
    await expect(page.getByTestId('regras-resultado')).toContainText('1 de 1');
  });

  test('arquiva, reativa e remove a regra', async ({ page }) => {
    const user = await seedUser();
    await loginViaUi(page, user.email, user.password);
    await page.goto('/app/categorization-rules');

    await createRuleViaUi(page, { name: 'Mercado', category: 'Alimentacao', pattern: 'mercado' });

    const row = page.locator('li[data-testid^="regra-"]');
    await expect(row).toContainText('Ativa');

    await row.getByRole('button', { name: 'Arquivar' }).click();
    await expect(row).toContainText('Arquivada');

    await row.getByRole('button', { name: 'Reativar' }).click();
    await expect(row).toContainText('Ativa');

    await row.getByRole('button', { name: 'Remover' }).click();
    await expect(page.getByText('Nenhuma regra cadastrada')).toBeVisible();
  });
});

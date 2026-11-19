import { expect, test } from '@playwright/test';
import { seedUser, utcDayOffset } from './utils/api';
import { loginViaUi } from './utils/ui';

/** Preenche o formulario de ajuste e adiciona a linha na lista. */
async function addAdjustment(
  page: import('@playwright/test').Page,
  adjustment: { description: string; type: 'income' | 'expense'; amount: string; date: string },
): Promise<void> {
  await page.getByTestId('cenario-ajuste-descricao').fill(adjustment.description);
  await page.getByTestId('cenario-ajuste-tipo').selectOption(adjustment.type);
  await page.getByTestId('cenario-ajuste-valor').fill(adjustment.amount);
  await page.getByTestId('cenario-ajuste-data').fill(adjustment.date);
  await page.getByTestId('cenario-ajuste-adicionar').click();
}

test.describe('Web · cenarios', () => {
  test('simula uma despesa hipotetica sem alterar o saldo real', async ({ page }) => {
    const seeded = await seedUser({ income: '1000.00' });

    await loginViaUi(page, seeded.email, seeded.password);
    await page.goto('/app/scenarios');

    await expect(page.getByRole('heading', { name: 'Cenarios', exact: true })).toBeVisible();
    await expect(page.getByTestId('cenario-vazio')).toBeVisible();

    await addAdjustment(page, {
      description: 'Comprar notebook',
      type: 'expense',
      amount: '300.00',
      date: utcDayOffset(5),
    });
    await expect(page.getByTestId('cenario-ajuste-0')).toContainText('Comprar notebook');

    await page.getByTestId('cenario-simular').click();

    await expect(page.getByTestId('cenario-resultado')).toBeVisible();
    await expect(page.getByTestId('cenario-saldo-real')).toContainText('R$ 1.000,00');
    await expect(page.getByTestId('cenario-saldo-final')).toContainText('R$ 700,00');
    await expect(page.getByTestId('cenario-impacto-valor')).toContainText('-R$ 300,00');
    await expect(page.getByTestId('cenario-aviso-negativo')).toHaveCount(0);
  });

  test('avisa quando o cenario deixa o saldo negativo', async ({ page }) => {
    const seeded = await seedUser({ income: '100.00' });

    await loginViaUi(page, seeded.email, seeded.password);
    await page.goto('/app/scenarios');

    await addAdjustment(page, {
      description: 'Despesa grande',
      type: 'expense',
      amount: '400.00',
      date: utcDayOffset(3),
    });
    await page.getByTestId('cenario-simular').click();

    await expect(page.getByTestId('cenario-aviso-negativo')).toBeVisible();
    await expect(page.getByTestId('cenario-menor-saldo')).toContainText('-R$ 300,00');
  });

  test('mostra o estado vazio e simula sem ajustes', async ({ page }) => {
    const seeded = await seedUser();

    await loginViaUi(page, seeded.email, seeded.password);
    await page.goto('/app/scenarios');

    await expect(page.getByTestId('cenario-vazio')).toBeVisible();
    await page.getByTestId('cenario-simular').click();

    await expect(page.getByTestId('cenario-resultado')).toBeVisible();
    await expect(page.getByTestId('cenario-saldo-final')).toContainText('R$ 0,00');
    await expect(page.getByTestId('cenario-impacto-valor')).toContainText('R$ 0,00');
  });
});

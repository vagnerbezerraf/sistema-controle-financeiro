import { expect, test } from '@playwright/test';
import { seedUser } from './utils/api';
import { loginViaUi } from './utils/ui';

/** Conteudo de um "PNG" qualquer: para o upload so importam mimetype e tamanho. */
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

test.describe('Web · comprovantes', () => {
  test('anexa, baixa e remove um comprovante', async ({ page }) => {
    const user = await seedUser({ expense: '120.00', expenseDescription: 'Compra com recibo E2E' });
    await loginViaUi(page, user.email, user.password);
    await page.goto('/app/transactions');

    const row = page.locator('tr', { hasText: 'Compra com recibo E2E' });
    await expect(row).toBeVisible();
    await row.getByTestId(/^comprovantes-/).click();

    const painel = page.getByTestId('comprovantes-painel');
    await expect(painel).toBeVisible();
    await expect(painel.getByText('Nenhum comprovante anexado.')).toBeVisible();

    await page
      .getByTestId('comprovante-arquivo')
      .setInputFiles({ name: 'recibo.png', mimeType: 'image/png', buffer: PNG });
    await page.getByTestId('comprovante-enviar').click();

    const item = painel.locator('li[data-testid^="comprovante-"]');
    await expect(item).toHaveCount(1);
    await expect(item).toContainText('recibo.png');
    await expect(item).toContainText('image/png');
    await expect(item.getByRole('button', { name: 'Baixar' })).toBeVisible();

    await item.getByRole('button', { name: 'Remover' }).click();
    await expect(painel.getByText('Nenhum comprovante anexado.')).toBeVisible();
    await expect(painel.locator('li[data-testid^="comprovante-"]')).toHaveCount(0);
  });

  test('recusa um arquivo de tipo nao suportado', async ({ page }) => {
    const user = await seedUser({ expense: '50.00', expenseDescription: 'Despesa invalida E2E' });
    await loginViaUi(page, user.email, user.password);
    await page.goto('/app/transactions');

    await page
      .locator('tr', { hasText: 'Despesa invalida E2E' })
      .getByTestId(/^comprovantes-/)
      .click();

    await page
      .getByTestId('comprovante-arquivo')
      .setInputFiles({
        name: 'malicioso.exe',
        mimeType: 'application/x-msdownload',
        buffer: Buffer.from('MZ executavel'),
      });
    await page.getByTestId('comprovante-enviar').click();

    await expect(page.getByText('Tipo de arquivo nao suportado')).toBeVisible();
    await expect(page.getByTestId('comprovantes-painel').getByText('Nenhum comprovante anexado.')).toBeVisible();
  });
});

import { expect, test } from '@playwright/test';
import { seedUser } from './utils/api';
import { loginViaUi } from './utils/ui';

test.describe('Web · Open Finance', () => {
  test('conecta, verifica autorizacao e revoga um consentimento', async ({ page }) => {
    const user = await seedUser();
    await loginViaUi(page, user.email, user.password);
    await page.goto('/app/open-finance');

    await expect(page.getByRole('heading', { name: 'Open Finance' })).toBeVisible();

    const banco = page.getByTestId('openfinance-instituicao-banco-exemplo');
    await expect(banco).toBeVisible();
    await expect(banco).toContainText('Banco Exemplo');

    await page.getByTestId('openfinance-conectar-banco-exemplo').click();
    await expect(page.getByTestId('openfinance-status-banco-exemplo')).toContainText(
      'Autorizacao pendente',
    );

    await page.getByTestId('openfinance-verificar-banco-exemplo').click();
    await expect(page.getByTestId('openfinance-status-banco-exemplo')).toContainText('Conectado');

    await page.getByTestId('openfinance-revogar-banco-exemplo').click();
    await expect(page.getByTestId('openfinance-status-banco-exemplo')).toContainText('Revogado');
  });

  test('abre a pagina pelo menu lateral', async ({ page }) => {
    const user = await seedUser();
    await loginViaUi(page, user.email, user.password);

    await page.getByTestId('nav-open-finance').click();
    await expect(page).toHaveURL(/\/app\/open-finance/);
    await expect(page.getByRole('heading', { name: 'Open Finance' })).toBeVisible();
  });

  test('sincroniza os lancamentos de um consentimento autorizado', async ({ page }) => {
    const user = await seedUser();
    await loginViaUi(page, user.email, user.password);
    await page.goto('/app/open-finance');

    await page.getByTestId('openfinance-conectar-banco-exemplo').click();
    await page.getByTestId('openfinance-verificar-banco-exemplo').click();
    await expect(page.getByTestId('openfinance-status-banco-exemplo')).toContainText('Conectado');

    await page.getByTestId('openfinance-conta-banco-exemplo').selectOption({ label: 'Conta E2E' });
    await page.getByTestId('openfinance-sincronizar-banco-exemplo').click();

    await expect(page.getByTestId('openfinance-sincronizado-banco-exemplo')).toContainText(
      '5 lancamento(s) importado(s)',
    );
  });
});

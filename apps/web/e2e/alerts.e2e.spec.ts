import { expect, test } from '@playwright/test';
import { seedUser, utcDayOffset } from './utils/api';
import { loginViaUi } from './utils/ui';

test.describe('Web · alertas de vencimento', () => {
  test('resume vencidas, de hoje e próximas e lista os vencimentos', async ({ page }) => {
    const user = await seedUser({
      obligations: [
        { type: 'expense', description: 'Conta vencida E2E', amount: '120.00', dueDate: utcDayOffset(-3) },
        { type: 'expense', description: 'Conta de hoje E2E', amount: '80.00', dueDate: utcDayOffset(0) },
        { type: 'income', description: 'Receber em breve E2E', amount: '500.00', dueDate: utcDayOffset(2) },
      ],
    });
    await loginViaUi(page, user.email, user.password);
    await page.goto('/app/alerts');

    await expect(page.getByRole('heading', { name: 'Alertas', exact: true })).toBeVisible();

    await expect(page.getByTestId('alertas-vencidas')).toContainText('1');
    await expect(page.getByTestId('alertas-hoje')).toContainText('1');
    await expect(page.getByTestId('alertas-breve')).toContainText('1');

    const vencida = page.locator('li', { hasText: 'Conta vencida E2E' });
    await expect(vencida).toContainText('Vencida');
    await expect(vencida).toContainText('3 dias em atraso');
    await expect(vencida).toContainText('R$ 120,00');
    await expect(page.locator('li', { hasText: 'Conta de hoje E2E' })).toContainText('Vence hoje');
    await expect(page.locator('li', { hasText: 'Receber em breve E2E' })).toContainText('Vence em breve');
  });

  test('o horizonte selecionado amplia o que entra como "vence em breve"', async ({ page }) => {
    const user = await seedUser({
      obligations: [
        { type: 'expense', description: 'Daqui a 10 dias E2E', amount: '150.00', dueDate: utcDayOffset(10) },
      ],
    });
    await loginViaUi(page, user.email, user.password);
    await page.goto('/app/alerts');

    // Fora do horizonte padrão (7 dias): nada aparece.
    await expect(page.getByText('Daqui a 10 dias E2E')).toHaveCount(0);
    await expect(page.getByTestId('alertas-breve')).toContainText('0');

    // Ampliando para 30 dias, o vencimento entra na lista.
    await page.getByTestId('alertas-horizonte').selectOption('30');
    await expect(page.getByText('Daqui a 10 dias E2E')).toBeVisible();
    await expect(page.getByTestId('alertas-breve')).toContainText('1');
  });

  test('mostra o estado vazio quando não há vencimentos', async ({ page }) => {
    const user = await seedUser();
    await loginViaUi(page, user.email, user.password);
    await page.goto('/app/alerts');

    await expect(page.getByText('Nenhum vencimento no periodo.')).toBeVisible();
    await expect(page.getByTestId('alertas-vencidas')).toContainText('0');
    await expect(page.getByTestId('alertas-breve')).toContainText('0');
  });
});

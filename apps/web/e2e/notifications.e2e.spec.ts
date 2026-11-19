import { expect, test } from '@playwright/test';
import { seedUser } from './utils/api';
import { loginViaUi } from './utils/ui';

test.describe('Web · preferencias de privacidade e notificacao', () => {
  test('exibe os padroes e desabilita a janela silenciosa quando desligada', async ({ page }) => {
    const user = await seedUser();

    await loginViaUi(page, user.email, user.password);
    await page.goto('/app/settings');

    await expect(page.getByTestId('notif-matriz')).toBeVisible();

    // Padrao: e-mail e desktop ligados, push desligado.
    for (const type of ['upcoming_due', 'invoice_due', 'budget_threshold', 'negative_balance']) {
      await expect(page.getByTestId(`notif-canal-${type}-email`)).toBeChecked();
      await expect(page.getByTestId(`notif-canal-${type}-desktop`)).toBeChecked();
      await expect(page.getByTestId(`notif-canal-${type}-push`)).not.toBeChecked();
    }

    await expect(page.getByTestId('notif-exibir-valores')).toBeChecked();
    await expect(page.getByTestId('notif-silencio-ativo')).not.toBeChecked();
    await expect(page.getByTestId('notif-silencio-inicio')).toBeDisabled();
    await expect(page.getByTestId('notif-silencio-fim')).toBeDisabled();
  });

  test('salva as mudancas e mantem apos recarregar a pagina', async ({ page }) => {
    const user = await seedUser();

    await loginViaUi(page, user.email, user.password);
    await page.goto('/app/settings');

    await expect(page.getByTestId('notif-matriz')).toBeVisible();

    await page.getByTestId('notif-canal-upcoming_due-email').uncheck();
    await page.getByTestId('notif-canal-budget_threshold-email').uncheck();
    await page.getByTestId('notif-silencio-ativo').check();
    await page.getByTestId('notif-silencio-inicio').fill('23:30');
    await page.getByTestId('notif-silencio-fim').fill('06:30');
    await page.getByTestId('notif-exibir-valores').uncheck();

    await page.getByTestId('notif-salvar').click();
    await expect(page.getByTestId('notif-sucesso')).toContainText('salvas');

    await page.reload();
    await expect(page.getByTestId('notif-matriz')).toBeVisible();

    await expect(page.getByTestId('notif-canal-upcoming_due-email')).not.toBeChecked();
    await expect(page.getByTestId('notif-canal-budget_threshold-email')).not.toBeChecked();
    await expect(page.getByTestId('notif-canal-invoice_due-desktop')).toBeChecked();
    await expect(page.getByTestId('notif-silencio-ativo')).toBeChecked();
    await expect(page.getByTestId('notif-silencio-inicio')).toHaveValue('23:30');
    await expect(page.getByTestId('notif-silencio-fim')).toHaveValue('06:30');
    await expect(page.getByTestId('notif-exibir-valores')).not.toBeChecked();
  });
});

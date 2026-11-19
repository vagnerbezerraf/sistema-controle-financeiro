import { expect, test } from '@playwright/test';
import { currentMonthDay, seedUser } from './utils/api';
import { loginViaUi } from './utils/ui';

test.describe('Web · calendário financeiro', () => {
  test('agrega os vencimentos do mês e detalha o dia selecionado', async ({ page }) => {
    const diaDaConta = currentMonthDay(10);
    const user = await seedUser({
      obligations: [
        { type: 'expense', description: 'IPTU Calendario E2E', amount: '450.00', dueDate: diaDaConta },
        { type: 'income', description: 'Freela E2E', amount: '1000.00', dueDate: currentMonthDay(20) },
      ],
    });
    await loginViaUi(page, user.email, user.password);
    await page.goto('/app/calendar');

    await expect(page.getByRole('heading', { name: 'Calendario financeiro' })).toBeVisible();

    // O resumo do mês soma os dois vencimentos semeados.
    await expect(page.getByText('A pagar (mes)').locator('..')).toContainText('R$ 450,00');
    await expect(page.getByText('A receber (mes)').locator('..')).toContainText('R$ 1.000,00');

    // Seleciona o dia da conta e confere o detalhamento.
    await page.getByTestId(`calendario-dia-${diaDaConta}`).click();
    const entrada = page.locator('[data-testid^="calendario-entrada-"]').first();
    await expect(entrada).toBeVisible();
    await expect(entrada).toContainText('IPTU Calendario E2E');
    await expect(entrada).toContainText('R$ 450,00');
  });

  test('inclui a fatura do cartão pelo dia de vencimento', async ({ page }) => {
    const vencimento = currentMonthDay(10);
    const user = await seedUser({
      // Fechamento no dia 5 e vencimento no dia 10: a compra do dia 5 cai na
      // fatura que vence ainda no mês corrente.
      creditCard: { name: 'Cartao Calendario', closingDay: 5, dueDay: 10 },
      purchase: '320.00',
    });
    await loginViaUi(page, user.email, user.password);
    await page.goto('/app/calendar');

    await page.getByTestId(`calendario-dia-${vencimento}`).click();

    const entrada = page.locator('[data-testid^="calendario-entrada-"]').first();
    await expect(entrada).toContainText('Fatura Cartao Calendario');
    await expect(entrada).toContainText('fatura');
    await expect(entrada).toContainText('R$ 320,00');
  });

  test('navega para o mês anterior e mostra o período sem vencimentos', async ({ page }) => {
    const user = await seedUser({
      obligations: [
        { type: 'expense', description: 'Conta do mes E2E', amount: '90.00', dueDate: currentMonthDay(12) },
      ],
    });
    await loginViaUi(page, user.email, user.password);
    await page.goto('/app/calendar');

    await page.getByTestId('calendario-mes-anterior').click();
    await expect(page.getByText('Nenhum vencimento neste periodo.')).toBeVisible();
    await expect(page.getByText('Conta do mes E2E')).toHaveCount(0);
  });
});

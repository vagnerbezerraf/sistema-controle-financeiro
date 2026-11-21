import { expect, test } from '@playwright/test';
import { seedUser } from './utils/api';
import { loginViaUi } from './utils/ui';

const CSVLUZ = ['data;descricao;valor;tipo', '10/06/2026;Conta de luz;120,00;despesa'].join('\n');

test.describe('Web · conciliacao', () => {
  test('sugere o casamento e concilia automaticamente', async ({ page }) => {
    const seeded = await seedUser({
      obligations: [
        { type: 'expense', description: 'Conta de luz', amount: '120.00', dueDate: '2026-06-10' },
      ],
      imports: [{ csv: CSVLUZ, fileName: 'extrato-junho.csv' }],
    });

    await loginViaUi(page, seeded.email, seeded.password);
    await page.goto('/app/reconciliation');

    await expect(page.getByRole('heading', { name: 'Conciliacao', exact: true })).toBeVisible();
    await expect(page.getByTestId('conciliacao-resumo-alta')).toContainText('1');
    await expect(page.getByTestId('conciliacao-sugestao-0')).toContainText('Conta de luz');
    await expect(page.getByTestId('conciliacao-sugestao-0')).toContainText('Alta');

    await page.getByTestId('conciliacao-automatica').click();

    await expect(page.getByTestId('conciliacao-sucesso')).toContainText('1 conta(s) conciliada(s)');
    await expect(page.getByTestId('conciliacao-vazio')).toBeVisible();
  });

  test('concilia manualmente escolhendo a conta e o item', async ({ page }) => {
    const seeded = await seedUser({
      obligations: [
        { type: 'expense', description: 'Conta de luz', amount: '120.00', dueDate: '2026-06-10' },
      ],
      imports: [{ csv: CSVLUZ, fileName: 'extrato-junho.csv' }],
    });

    await loginViaUi(page, seeded.email, seeded.password);
    await page.goto('/app/reconciliation');

    await expect(page.getByTestId('conciliacao-conta')).toBeVisible();
    await expect(page.getByTestId('conciliacao-item')).toBeVisible();

    await page.getByTestId('conciliacao-conciliar').click();

    await expect(page.getByTestId('conciliacao-sucesso')).toContainText('1 conta(s) conciliada(s)');
    await expect(page.getByTestId('conciliacao-vazio')).toBeVisible();
  });
});

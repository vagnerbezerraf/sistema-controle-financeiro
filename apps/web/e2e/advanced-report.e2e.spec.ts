import { expect, test } from '@playwright/test';
import { seedUser } from './utils/api';
import { loginViaUi } from './utils/ui';

/** Competencia (YYYY-MM) do mes corrente no fuso do dashboard. */
function currentMonth(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  const year = parts.find((p) => p.type === 'year')!.value;
  const month = parts.find((p) => p.type === 'month')!.value;
  return `${year}-${month}`;
}

test.describe('Web · relatorios avancados', () => {
  test('mostra patrimonio liquido, taxa de poupanca e evolucao do mes', async ({ page }) => {
    // Receita 2000 e despesa 1500 na conta; compra 300 no cartao (passivo).
    const seeded = await seedUser({
      income: '2000.00',
      expense: '1500.00',
      creditCard: { name: 'Cartao E2E' },
      purchase: '300.00',
    });

    await loginViaUi(page, seeded.email, seeded.password);
    await page.goto('/app/reports');

    await expect(page.getByTestId('relatorios-avancados')).toBeVisible();

    // Patrimonio: ativos 500 (2000 - 1500), passivos 300 e liquido 200.
    await expect(page.getByTestId('patrimonio-ativos')).toContainText('R$ 500,00');
    await expect(page.getByTestId('patrimonio-passivos')).toContainText('R$ 300,00');
    await expect(page.getByTestId('patrimonio-liquido-valor')).toContainText('R$ 200,00');

    // Poupanca: sobrou 200 sobre 2000 de receita (despesas 1800) = 10%.
    await expect(page.getByTestId('poupanca-receitas')).toContainText('R$ 2.000,00');
    await expect(page.getByTestId('poupanca-despesas')).toContainText('R$ 1.800,00');
    await expect(page.getByTestId('poupanca-taxa')).toContainText('10,0%');

    // Evolucao: o mes corrente entra com o liquido do periodo.
    const linhaAtual = page.getByTestId(`evolucao-${currentMonth()}`);
    await expect(linhaAtual).toContainText('R$ 2.000,00');
    await expect(linhaAtual).toContainText('R$ 200,00');
  });

  test('mostra zeros e taxa sem base em um espaco sem movimento', async ({ page }) => {
    const seeded = await seedUser();

    await loginViaUi(page, seeded.email, seeded.password);
    await page.goto('/app/reports');

    await expect(page.getByTestId('patrimonio-liquido-valor')).toContainText('R$ 0,00');
    await expect(page.getByTestId('poupanca-taxa')).toContainText('Sem base');
    await expect(page.getByTestId('evolucao-mensal').getByRole('row')).toHaveCount(7);
  });
});

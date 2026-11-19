import { expect, test } from '@playwright/test';
import { seedUser, currentMonthDay } from './utils/api';
import { loginViaUi } from './utils/ui';

/** Envia um conteudo CSV para o input de arquivo da pagina de importacao. */
async function uploadCsv(
  page: import('@playwright/test').Page,
  fileName: string,
  csv: string,
): Promise<void> {
  await page.getByTestId('importacao-arquivo').setInputFiles({
    name: fileName,
    mimeType: 'text/csv',
    buffer: Buffer.from(csv, 'utf-8'),
  });
}

/** Envia um conteudo OFX para o input de arquivo da pagina de importacao. */
async function uploadOfx(
  page: import('@playwright/test').Page,
  fileName: string,
  ofx: string,
): Promise<void> {
  await page.getByTestId('importacao-arquivo').setInputFiles({
    name: fileName,
    mimeType: 'application/x-ofx',
    buffer: Buffer.from(ofx, 'utf-8'),
  });
}

test.describe('Web · importacao CSV', () => {
  test('gera a previa, importa as linhas validas e permite desfazer', async ({ page }) => {
    const seeded = await seedUser();

    const csv = [
      'data;descricao;valor;tipo',
      '15/06/2026;Mercado;100,00;despesa',
      '16/06/2026;Salario;5000,00;receita',
      '16/06/2026;Salario;5000,00;receita',
    ].join('\n');

    await loginViaUi(page, seeded.email, seeded.password);
    await page.goto('/app/imports');

    await expect(page.getByRole('heading', { name: 'Importar extrato' })).toBeVisible();
    await expect(page.getByTestId('importacao-historico-vazio')).toBeVisible();

    await page.getByTestId('importacao-conta').selectOption(seeded.accountId);
    await uploadCsv(page, 'extrato-junho.csv', csv);
    await page.getByTestId('importacao-gerar-previa').click();

    await expect(page.getByTestId('importacao-previa')).toBeVisible();
    await expect(page.getByTestId('importacao-resumo-total')).toContainText('3');
    await expect(page.getByTestId('importacao-resumo-validas')).toContainText('2');
    await expect(page.getByTestId('importacao-resumo-duplicadas')).toContainText('1');
    await expect(page.getByTestId('importacao-linha-0')).toContainText('Valida');
    await expect(page.getByTestId('importacao-linha-2')).toContainText('Duplicada (no arquivo)');

    await page.getByTestId('importacao-aplicar').click();

    await expect(page.getByTestId('importacao-sucesso')).toContainText('2 lancamentos importados');
    await expect(page.getByTestId('importacao-previa')).toHaveCount(0);

    const lote = page.locator('[data-testid^="importacao-lote-"]');
    await expect(lote).toHaveCount(1);
    await expect(lote).toContainText('Importado');
    await expect(lote).toContainText('2 importadas');

    await page.locator('[data-testid^="importacao-desfazer-"]').click();

    await expect(page.getByTestId('importacao-sucesso')).toContainText('desfeita');
    await expect(lote).toContainText('Desfeito');
  });

  test('marca como duplicada uma linha que ja existe na conta', async ({ page }) => {
    const expenseDate = currentMonthDay(10);
    const seeded = await seedUser({
      expense: '250.00',
      expenseDescription: 'Aluguel E2E',
    });

    const csv = [
      'data;descricao;valor;tipo',
      `${expenseDate};Aluguel E2E;250,00;despesa`,
    ].join('\n');

    await loginViaUi(page, seeded.email, seeded.password);
    await page.goto('/app/imports');

    await page.getByTestId('importacao-conta').selectOption(seeded.accountId);
    await uploadCsv(page, 'extrato-duplicado.csv', csv);
    await page.getByTestId('importacao-gerar-previa').click();

    await expect(page.getByTestId('importacao-resumo-validas')).toContainText('0');
    await expect(page.getByTestId('importacao-resumo-duplicadas')).toContainText('1');
    await expect(page.getByTestId('importacao-linha-0')).toContainText('Duplicada (ja existente)');
    await expect(page.getByTestId('importacao-aplicar')).toBeDisabled();
  });
});

test.describe('Web · importacao OFX', () => {
  test('gera a previa, importa as linhas validas e permite desfazer', async ({ page }) => {
    const seeded = await seedUser();

    const ofx = [
      '<OFX>',
      '<BANKTRANLIST>',
      '<STMTTRN>',
      '<TRNTYPE>DEBIT',
      '<DTPOSTED>20260615',
      '<TRNAMT>-100.00',
      '<FITID>FIT-1',
      '<MEMO>Mercado</MEMO>',
      '</STMTTRN>',
      '<STMTTRN>',
      '<TRNTYPE>CREDIT',
      '<DTPOSTED>20260616',
      '<TRNAMT>5000.00',
      '<FITID>FIT-2',
      '<MEMO>Salario</MEMO>',
      '</STMTTRN>',
      '<STMTTRN>',
      '<TRNTYPE>CREDIT',
      '<DTPOSTED>20260616',
      '<TRNAMT>5000.00',
      '<FITID>FIT-2',
      '<MEMO>Salario</MEMO>',
      '</STMTTRN>',
      '</BANKTRANLIST>',
      '</OFX>',
    ].join('\n');

    await loginViaUi(page, seeded.email, seeded.password);
    await page.goto('/app/imports');

    await expect(page.getByRole('heading', { name: 'Importar extrato' })).toBeVisible();

    await page.getByTestId('importacao-formato').selectOption('ofx');
    await page.getByTestId('importacao-conta').selectOption(seeded.accountId);
    await uploadOfx(page, 'extrato-junho.ofx', ofx);
    await page.getByTestId('importacao-gerar-previa').click();

    await expect(page.getByTestId('importacao-previa')).toBeVisible();
    await expect(page.getByTestId('importacao-resumo-total')).toContainText('3');
    await expect(page.getByTestId('importacao-resumo-validas')).toContainText('2');
    await expect(page.getByTestId('importacao-resumo-duplicadas')).toContainText('1');
    await expect(page.getByTestId('importacao-linha-0')).toContainText('Valida');
    await expect(page.getByTestId('importacao-linha-2')).toContainText('Duplicada (no arquivo)');

    await page.getByTestId('importacao-aplicar').click();

    await expect(page.getByTestId('importacao-sucesso')).toContainText('2 lancamentos importados');
    await expect(page.getByTestId('importacao-previa')).toHaveCount(0);

    const lote = page.locator('[data-testid^="importacao-lote-"]');
    await expect(lote).toHaveCount(1);
    await expect(lote).toContainText('Importado');
    await expect(lote).toContainText('extrato-junho.ofx');

    await page.locator('[data-testid^="importacao-desfazer-"]').click();

    await expect(page.getByTestId('importacao-sucesso')).toContainText('desfeita');
    await expect(lote).toContainText('Desfeito');
  });
});

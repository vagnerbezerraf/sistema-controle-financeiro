import { $, expect } from '@wdio/globals';
import { seedUser } from '../utils/api';
import { clickNav, login, resetApp } from '../utils/ui';

async function openRules(): Promise<void> {
  await clickNav('Regras de categorizacao');
  await expect(await $('h1')).toHaveText('Regras de categorizacao');
}

async function createRule(options: { name: string; category: string; pattern: string }): Promise<void> {
  await (await $('#regra-nova')).click();
  await (await $('#regra-nome')).setValue(options.name);
  await (await $('#regra-categoria')).selectByVisibleText(options.category);
  await (await $('#regra-padrao')).setValue(options.pattern);
  await (await $('#regra-salvar')).click();
}

describe('Desktop · regras de categorizacao', () => {
  it('cria uma regra e a lista por precedencia', async () => {
    const user = await seedUser();
    await resetApp();
    await login(user.email, user.password);
    await openRules();

    await createRule({ name: 'Mercado', category: 'Alimentacao', pattern: 'mercado' });

    const row = await $('//li[contains(@id, "regra-") and contains(., "Mercado")]');
    await row.waitForDisplayed({ timeout: 20_000 });
    await expect(row).toHaveText(expect.stringContaining('Alimentacao'));
    await expect(row).toHaveText(expect.stringContaining('Contem'));
  });

  it('aplica as regras retroativamente aos lancamentos sem categoria', async () => {
    const user = await seedUser({ expense: '250.00', expenseDescription: 'Mercado E2E' });
    await resetApp();
    await login(user.email, user.password);
    await openRules();

    await createRule({ name: 'Mercado', category: 'Alimentacao', pattern: 'mercado' });
    await (await $('#regras-aplicar')).click();

    const result = await $('#regras-resultado');
    await result.waitForDisplayed({ timeout: 20_000 });
    await expect(result).toHaveText(expect.stringContaining('1 de 1'));
  });

  it('arquiva, reativa e remove a regra', async () => {
    const user = await seedUser();
    await resetApp();
    await login(user.email, user.password);
    await openRules();

    await createRule({ name: 'Mercado', category: 'Alimentacao', pattern: 'mercado' });

    const row = await $('//li[contains(@id, "regra-") and contains(., "Mercado")]');
    await row.waitForDisplayed({ timeout: 20_000 });
    await expect(row).toHaveText(expect.stringContaining('Ativa'));

    await (await row.$('button*=Arquivar')).click();
    await expect(row).toHaveText(expect.stringContaining('Arquivada'));

    await (await row.$('button*=Reativar')).click();
    await expect(row).toHaveText(expect.stringContaining('Ativa'));

    await (await row.$('button*=Remover')).click();
    // Apos remover, nenhuma linha de regra deve restar na lista.
    await (await $('//li[contains(@id, "regra-")]')).waitForExist({ reverse: true, timeout: 20_000 });
  });
});

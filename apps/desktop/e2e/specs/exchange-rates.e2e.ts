import { $, expect } from '@wdio/globals';
import { seedUser } from '../utils/api';
import { clickNav, login, resetApp } from '../utils/ui';

async function openRates(): Promise<void> {
  await clickNav('Taxas de cambio');
  await expect(await $('h1')).toHaveText('Taxas de cambio');
}

async function createRate(options: { from: string; to: string; rate: string; source?: string }): Promise<void> {
  await (await $('#taxa-nova')).click();
  await (await $('#taxa-de')).selectByVisibleText(options.from);
  await (await $('#taxa-para')).selectByVisibleText(options.to);
  await (await $('#taxa-valor')).setValue(options.rate);
  if (options.source) await (await $('#taxa-fonte')).setValue(options.source);
  await (await $('#taxa-salvar')).click();
}

describe('Desktop · taxas de cambio', () => {
  it('cria uma taxa e a lista', async () => {
    const user = await seedUser();
    await resetApp();
    await login(user.email, user.password);
    await openRates();

    await createRate({ from: 'USD', to: 'BRL', rate: '5.2500', source: 'Banco Central' });

    const row = await $('//li[contains(@id, "taxa-item-") and contains(., "USD")]');
    await row.waitForDisplayed({ timeout: 20_000 });
    await expect(row).toHaveText(expect.stringContaining('BRL'));
    await expect(row).toHaveText(expect.stringContaining('5.25'));
    await expect(row).toHaveText(expect.stringContaining('Banco Central'));
  });

  it('edita o valor da taxa e remove', async () => {
    const user = await seedUser();
    await resetApp();
    await login(user.email, user.password);
    await openRates();

    await createRate({ from: 'USD', to: 'BRL', rate: '5.0000' });

    const row = await $('//li[contains(@id, "taxa-item-") and contains(., "USD")]');
    await row.waitForDisplayed({ timeout: 20_000 });

    await (await row.$('button*=Editar')).click();
    await (await row.$('input')).setValue('6.1000');
    await (await row.$('button*=Salvar')).click();

    await expect(row).toHaveText(expect.stringContaining('6.1'));

    await (await row.$('button*=Remover')).click();
    await (await $('//li[contains(@id, "taxa-item-")]')).waitForExist({ reverse: true, timeout: 20_000 });
  });
});

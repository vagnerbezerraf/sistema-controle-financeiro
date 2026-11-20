import { $, expect } from '@wdio/globals';
import { seedUser } from '../utils/api';
import { clickNav, login, resetApp } from '../utils/ui';

async function openBudgets(): Promise<void> {
  await clickNav('Orcamentos');
  await expect(await $('h1')).toHaveText('Orcamentos');
}

describe('Desktop · orcamentos', () => {
  it('cria um orcamento geral e mostra o consumo do periodo', async () => {
    const user = await seedUser({ expense: '300.00' });
    await resetApp();
    await login(user.email, user.password);
    await openBudgets();

    await (await $('#orcamento-novo')).click();
    await (await $('#orcamento-limite')).setValue('1000.00');
    await (await $('#orcamento-salvar')).click();

    const row = await $('//li[contains(@id, "orcamento-") and contains(., "Geral")]');
    await row.waitForDisplayed({ timeout: 20_000 });
    await expect(row).toHaveText(expect.stringContaining('300,00'));
    await expect(row).toHaveText(expect.stringContaining('1.000,00'));
  });
});

describe('Desktop · categorias e metas', () => {
  it('navega pelas novas paginas de paridade', async () => {
    const user = await seedUser();
    await resetApp();
    await login(user.email, user.password);

    await clickNav('Categorias');
    await expect(await $('h1')).toHaveText('Categorias');

    await clickNav('Metas');
    await expect(await $('h1')).toHaveText('Metas');

    await (await $('#meta-nova')).click();
    await (await $('#meta-nome')).setValue('Reserva Desktop E2E');
    await (await $('#meta-alvo')).setValue('5000.00');
    await (await $('#meta-salvar')).click();

    const row = await $('//li[contains(@id, "meta-") and contains(., "Reserva Desktop E2E")]');
    await row.waitForDisplayed({ timeout: 20_000 });
    await expect(row).toHaveText(expect.stringContaining('5.000,00'));
  });
});

import { $, expect } from '@wdio/globals';
import { seedUser } from '../utils/api';
import { clickNav, login, resetApp } from '../utils/ui';

describe('Desktop · dashboard e navegacao', () => {
  it('consolida no dashboard os totais do mes a partir de dados reais', async () => {
    const user = await seedUser({ income: '1000.00', expense: '250.50' });
    await resetApp();
    await login(user.email, user.password);

    // Receita 1000,00 - despesa 250,50 = saldo realizado 749,50.
    const body = await $('body');
    await expect(body).toHaveText(expect.stringContaining('1.000,00'));
    await expect(body).toHaveText(expect.stringContaining('250,50'));
    await expect(body).toHaveText(expect.stringContaining('749,50'));

    // Os lancamentos criados aparecem na lista de recentes.
    await expect(body).toHaveText(expect.stringContaining('Salario E2E'));
    await expect(body).toHaveText(expect.stringContaining('Aluguel E2E'));
  });

  it('navega entre lancamentos, contas e dashboard', async () => {
    const user = await seedUser();
    await resetApp();
    await login(user.email, user.password);

    await clickNav('Lancamentos');
    await expect(await $('h1')).toHaveText('Lancamentos');

    await clickNav('Contas');
    await expect(await $('h1')).toHaveText('Contas');

    await clickNav('Dashboard');
    await expect(await $('h1')).toHaveText('Dashboard');
  });

  it('encerra a sessao e volta para o login', async () => {
    const user = await seedUser();
    await resetApp();
    await login(user.email, user.password);

    await (await $('//button[contains(., "Sair")]')).click();

    await expect(await $('#email')).toBeDisplayed();
  });
});

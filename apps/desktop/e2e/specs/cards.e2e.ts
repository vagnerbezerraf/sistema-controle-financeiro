import { $, browser, expect } from '@wdio/globals';
import { seedUser } from '../utils/api';
import { clickNav, login, resetApp } from '../utils/ui';

describe('Desktop · cartoes e faturas', () => {
  it('cria um cartao pela interface', async () => {
    const user = await seedUser();
    await resetApp();
    await login(user.email, user.password);

    await clickNav('Cartoes');
    await expect(await $('h1')).toHaveText('Cartoes e faturas');

    await (await $('#novo-cartao')).click();
    await (await $('#cardName')).setValue('Cartao Desktop E2E');
    await (await $('#cartao-salvar')).click();

    const body = await $('body');
    await expect(body).toHaveText(expect.stringContaining('Cartao Desktop E2E'));
  });

  it('agrupa compras em fatura e permite pagar por transferencia', async () => {
    const user = await seedUser({
      creditCard: { name: 'Cartao Fatura E2E', closingDay: 25, dueDay: 5 },
      purchase: '300.00',
    });
    await resetApp();
    await login(user.email, user.password);

    await clickNav('Cartoes');
    const body = await $('body');
    await expect(body).toHaveText(expect.stringContaining('Cartao Fatura E2E'));
    await expect(body).toHaveText(expect.stringContaining('300,00'));

    // O id do botao "Pagar" carrega o dia de fechamento (ex.: pagar-2026-11-25).
    await (await $('[id^="pagar-20"]')).click();
    await (await $('#pagar-confirmar')).click();

    // Depois de quitar, nao restam faturas com botao de pagamento.
    await browser.waitUntil(async () => !(await $('[id^="pagar-20"]').isExisting()), { timeout: 30_000 });
    await expect(body).toHaveText(expect.stringContaining('aberto R$ 0,00'));
  });
});

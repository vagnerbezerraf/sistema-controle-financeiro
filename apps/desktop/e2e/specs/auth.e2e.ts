import { $, browser, expect } from '@wdio/globals';
import { seedUser } from '../utils/api';
import { resetApp } from '../utils/ui';

describe('Desktop · autenticacao', () => {
  beforeEach(async () => {
    await resetApp();
  });

  it('abre no login quando nao ha sessao salva', async () => {
    await expect(await $('#email')).toBeDisplayed();
    await expect(await $('button[type="submit"]')).toHaveText('Entrar');
  });

  it('mostra erro e permanece no login quando a senha e invalida', async () => {
    const user = await seedUser();

    await $('#email').setValue(user.email);
    await $('#password').setValue('SenhaErrada!123');
    await $('button[type="submit"]').click();

    await browser.waitUntil(async () => (await $('body').getText()).toLowerCase().includes('invalid'), {
      timeout: 15_000,
      timeoutMsg: 'a mensagem de credenciais invalidas nao apareceu',
    });
    await expect(await $('#email')).toBeDisplayed();
  });

  it('autentica com credenciais validas e entra no dashboard', async () => {
    const user = await seedUser();

    await $('#email').setValue(user.email);
    await $('#password').setValue(user.password);
    await $('button[type="submit"]').click();

    await expect(await $('h1')).toHaveText('Dashboard');
    await expect(await $('//button[contains(., "Sair")]')).toBeDisplayed();
  });
});

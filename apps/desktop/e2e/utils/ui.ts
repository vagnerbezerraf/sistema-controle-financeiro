import { $, browser } from '@wdio/globals';

const UI_TIMEOUT = 20_000;

/**
 * O WebView2 guarda o `localStorage` entre execucoes do binario, entao a sessao
 * anterior reaparece. Limpamos o storage e recarregamos para sempre partir do
 * login.
 */
export async function resetApp(): Promise<void> {
  await browser.execute(() => {
    try {
      window.localStorage.clear();
    } catch {
      // storage indisponivel: nada a limpar
    }
  });
  await browser.refresh();
  await (await $('#email')).waitForDisplayed({ timeout: UI_TIMEOUT });
}

export async function login(email: string, password: string): Promise<void> {
  await (await $('#email')).waitForDisplayed({ timeout: UI_TIMEOUT });
  await $('#email').setValue(email);
  await $('#password').setValue(password);
  await $('button[type="submit"]').click();
  await (await $('h1')).waitForDisplayed({ timeout: UI_TIMEOUT });
}

export async function clickNav(label: string): Promise<void> {
  const link = await $(`//a[normalize-space()="${label}"]`);
  await link.waitForClickable({ timeout: UI_TIMEOUT });
  await link.click();
}

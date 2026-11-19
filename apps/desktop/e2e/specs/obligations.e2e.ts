import { $, browser, expect } from '@wdio/globals';
import { seedUser } from '../utils/api';
import { clickNav, login, resetApp } from '../utils/ui';

/**
 * Inputs `type=date` nao aceitam `setValue` de forma confiavel no WebView2; o
 * setter nativo + evento `input` atualiza o campo controlado pelo React.
 */
async function setDate(id: string, value: string): Promise<void> {
  await browser.execute(
    (fieldId: string, v: string) => {
      const el = document.getElementById(fieldId) as HTMLInputElement | null;
      if (!el) throw new Error(`campo nao encontrado: ${fieldId}`);
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
      setter.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    },
    id,
    value,
  );
}

async function openObligations(): Promise<void> {
  await clickNav('Contas a pagar');
  await expect(await $('h1')).toHaveText('Contas a pagar e receber');
}

describe('Desktop · contas a pagar e receber', () => {
  it('cria uma conta avulsa pela interface', async () => {
    const user = await seedUser();
    await resetApp();
    await login(user.email, user.password);
    await openObligations();

    await (await $('#nova-conta')).click();
    await (await $('#conta-descricao')).setValue('IPTU Desktop E2E');
    await (await $('#conta-valor')).setValue('450.00');
    await setDate('conta-vencimento', '2099-01-10');
    await (await $('#conta-salvar')).click();

    const row = await $('//li[contains(@id, "conta-") and contains(., "IPTU Desktop E2E")]');
    await row.waitForDisplayed({ timeout: 20_000 });
    await expect(row).toHaveText(expect.stringContaining('450,00'));
  });

  it('cria uma recorrencia mensal e materializa as previsoes', async () => {
    const user = await seedUser();
    await resetApp();
    await login(user.email, user.password);
    await openObligations();

    await (await $('#nova-recorrencia')).click();
    await (await $('#recorrencia-descricao')).setValue('Aluguel Desktop E2E');
    await (await $('#recorrencia-valor')).setValue('1800.00');
    await setDate('recorrencia-inicio', '2026-01-10');
    await setDate('recorrencia-horizonte', '2026-06-30');
    await (await $('#recorrencia-salvar')).click();

    const ruleRow = await $('//li[contains(@id, "regra-") and contains(., "Aluguel Desktop E2E")]');
    await ruleRow.waitForDisplayed({ timeout: 20_000 });
    await expect(ruleRow).toHaveText(expect.stringContaining('mensal'));
  });

  it('filtra somente as contas vencidas', async () => {
    const user = await seedUser({
      obligations: [
        { type: 'expense', description: 'Conta vencida E2E', amount: '10.00', dueDate: '2020-01-05' },
        { type: 'expense', description: 'Conta futura E2E', amount: '20.00', dueDate: '2099-01-05' },
      ],
    });
    await resetApp();
    await login(user.email, user.password);
    await openObligations();

    await expect(await $('body')).toHaveText(expect.stringContaining('Conta vencida E2E'));
    await expect(await $('body')).toHaveText(expect.stringContaining('Conta futura E2E'));

    await (await $('#filtro-vencidas')).click();

    await browser.waitUntil(
      async () => {
        const text = await (await $('body')).getText();
        return !text.includes('Conta futura E2E');
      },
      { timeout: 20_000 },
    );
    await expect(await $('body')).toHaveText(expect.stringContaining('Conta vencida E2E'));
  });

  it('concilia uma conta com um lancamento confirmado', async () => {
    const user = await seedUser({
      expense: '200.00',
      obligations: [
        { type: 'expense', description: 'Luz Desktop E2E', amount: '200.00', dueDate: '2099-01-10' },
      ],
    });
    await resetApp();
    await login(user.email, user.password);
    await openObligations();

    const row = await $('//li[contains(@id, "conta-") and contains(., "Luz Desktop E2E")]');
    await row.waitForDisplayed({ timeout: 20_000 });
    await (await row.$('.//button[starts-with(@id, "conciliar-")]')).click();
    await (await $('#conciliar-confirmar')).click();

    await browser.waitUntil(
      async () => (await row.getText()).includes('Conciliada'),
      { timeout: 20_000 },
    );
  });
});

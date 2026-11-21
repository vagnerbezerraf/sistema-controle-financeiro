import { $, expect } from '@wdio/globals';
import { seedUser } from '../utils/api';
import { clickNav, login, resetApp } from '../utils/ui';

async function openReports(): Promise<void> {
  await clickNav('Relatorios assincronos');
  await expect(await $('h1')).toHaveText('Relatorios assincronos');
}

async function createReport(options: { from?: string; to?: string }): Promise<void> {
  if (options.from) await (await $('#relatorio-from')).setValue(options.from);
  if (options.to) await (await $('#relatorio-to')).setValue(options.to);
  await (await $('#relatorio-criar')).click();
}

describe('Desktop · relatorios assincronos', () => {
  it('solicita um relatorio pelo periodo e o lista enquanto pendente', async () => {
    const user = await seedUser();
    await resetApp();
    await login(user.email, user.password);
    await openReports();

    await createReport({ from: '2026-01-01', to: '2026-01-31' });

    const row = await $('//li[contains(@id, "relatorio-item-")]');
    await row.waitForDisplayed({ timeout: 20_000 });
    await expect(row).toHaveText(expect.stringContaining('Exportacao de lancamentos'));
    await expect(row).toHaveText(expect.stringContaining('Pendente'));
    // Sem o job concluido, o item nao oferece download.
    await expect(await row.$('button*=Baixar')).not.toBeExisting();
  });

  it('mostra o estado vazio antes de qualquer pedido', async () => {
    const user = await seedUser();
    await resetApp();
    await login(user.email, user.password);
    await openReports();

    const empty = await $('//*[contains(text(), "Nenhum relatorio solicitado.")]');
    await empty.waitForDisplayed({ timeout: 20_000 });

    await createReport({ from: '2026-02-01', to: '2026-02-28' });

    const row = await $('//li[contains(@id, "relatorio-item-")]');
    await row.waitForDisplayed({ timeout: 20_000 });
    await expect(row).toHaveText(expect.stringContaining('01/02/2026 a 28/02/2026'));
    await expect(empty).not.toBeDisplayed();
  });
});

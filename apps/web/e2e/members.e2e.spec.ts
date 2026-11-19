import { expect, test } from '@playwright/test';
import { seedUser, registerViaApi, inviteMemberViaApi } from './utils/api';
import { loginViaUi } from './utils/ui';

test.describe('Web · membros e convites', () => {
  test('convida um e-mail, exibe o link e revoga o convite', async ({ page }) => {
    const owner = await seedUser();

    await loginViaUi(page, owner.email, owner.password);
    await page.goto('/app/members');

    await expect(page.getByRole('heading', { name: 'Membros', exact: true })).toBeVisible();
    await expect(page.getByTestId('membros-lista')).toContainText(owner.email);
    await expect(page.getByTestId('convites-vazio')).toBeVisible();

    await page.getByTestId('convite-email').fill('convidado@scf.test');
    await page.getByTestId('convite-papel').selectOption('viewer');
    await page.getByTestId('convite-enviar').click();

    await expect(page.getByTestId('membros-sucesso')).toContainText('convidado@scf.test');
    await expect(page.getByTestId('convite-link')).toContainText('/app/invites/accept?token=');

    const pendente = page.locator('[data-testid^="convite-pendente-"]');
    await expect(pendente).toHaveCount(1);
    await expect(pendente).toContainText('convidado@scf.test');
    await expect(pendente).toContainText('Somente leitura');

    await page.locator('[data-testid^="convite-revogar-"]').click();

    await expect(page.getByTestId('membros-sucesso')).toContainText('revogado');
    await expect(page.getByTestId('convites-vazio')).toBeVisible();
  });

  test('aceita o convite e passa a acessar o espaco', async ({ page }) => {
    const owner = await seedUser();
    const invitee = await registerViaApi();
    const invite = await inviteMemberViaApi(owner.accessToken, owner.spaceId, invitee.email, 'contributor');

    await loginViaUi(page, invitee.email, invitee.password);
    await page.goto(`/app/invites/accept?token=${invite.token}`);

    await page.getByTestId('convite-aceitar').click();

    await expect(page.getByTestId('convite-aceite-sucesso')).toContainText('Convite aceito');

    await page.getByTestId('convite-ir-espaco').click();
    await expect(page).toHaveURL(/\/app\/dashboard/);

    // O espaco compartilhado passa a constar no seletor do menu.
    await expect(page.locator('aside select option')).toHaveCount(2);
  });
});

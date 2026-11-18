import { expect, test } from '@playwright/test';
import { seedUser, TEST_PASSWORD, uniqueEmail } from './utils/api';
import { loginViaUi } from './utils/ui';

test.describe('Web · autenticação', () => {
  test('cadastra uma nova conta e entra no dashboard', async ({ page }) => {
    const email = uniqueEmail('cadastro');

    await page.goto('/register');
    await page.locator('#name').fill('Maria E2E');
    await page.locator('#email').fill(email);
    await page.locator('#password').fill(TEST_PASSWORD);
    await page.locator('#password2').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: 'Criar conta e entrar' }).click();

    await expect(page).toHaveURL(/\/app\/dashboard/, { timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'Resumo financeiro' })).toBeVisible();
  });

  test('autentica com credenciais válidas e entra no dashboard', async ({ page }) => {
    const user = await seedUser();

    await loginViaUi(page, user.email, user.password);

    await expect(page.getByRole('heading', { name: 'Resumo financeiro' })).toBeVisible();
  });

  test('exibe erro e permanece no login quando a senha é inválida', async ({ page }) => {
    const user = await seedUser();

    await page.goto('/login');
    await page.locator('#email').fill(user.email);
    await page.locator('#password').fill('SenhaErrada!123');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();

    await expect(page.getByText('Credenciais invalidas')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('encerra a sessão e volta para o login', async ({ page }) => {
    const user = await seedUser();
    await loginViaUi(page, user.email, user.password);

    // A barra lateral só existe em telas md+; o botão do cabeçalho fica oculto.
    await page.locator('aside').getByRole('button', { name: 'Sair' }).click();

    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator('#email')).toBeVisible();
  });
});

import { expect, Page } from '@playwright/test';

/** Autentica pela tela de login e aguarda o dashboard. */
export async function loginViaUi(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/dashboard/, { timeout: 20_000 });
}

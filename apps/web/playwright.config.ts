import { defineConfig, devices } from '@playwright/test';

const WEB_URL = process.env.E2E_WEB_URL ?? 'http://localhost:3000';
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001';
const API_PREFIX = '/api/v1';

/**
 * E2E da Web. Sobe a API (Nest) e o Next em modo dev caso não estejam
 * rodando. A API usa o banco de desenvolvimento (`apps/api/.env`); cada teste
 * cria o seu próprio usuário, então os dados são isolados por espaço
 * financeiro mesmo com o banco compartilhado.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: WEB_URL,
    trace: 'on-first-retry',
    locale: 'pt-BR',
    // O dashboard agrupa por mês conforme o fuso do navegador; fixamos o mesmo
    // fuso usado pela API para que a competência dos dados de teste coincida.
    timezoneId: 'America/Sao_Paulo',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm --filter @scf/api dev',
      url: `${API_URL}/health`,
      cwd: '../..',
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      stdout: 'ignore',
    },
    {
      command: 'pnpm --filter @scf/web dev',
      url: WEB_URL,
      cwd: '../..',
      env: { NEXT_PUBLIC_API_BASE_URL: `${API_URL}${API_PREFIX}` },
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      stdout: 'ignore',
    },
  ],
});

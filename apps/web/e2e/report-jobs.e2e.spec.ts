import { expect, request, test } from '@playwright/test';
import { PrismaClient } from '../../api/node_modules/@prisma/client';
import { API_ORIGIN, API_PREFIX, seedUser } from './utils/api';
import { loginViaUi } from './utils/ui';

/**
 * A API/worker usam o banco de desenvolvimento (`apps/api/.env`). Como o
 * `@prisma/client` esta isolado por pacote no workspace, apontamos para o client
 * gerado da API e reutilizamos a mesma `DATABASE_URL` para marcar o job como
 * pronto (o worker nao roda durante os testes E2E).
 */
const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://scf:scf_dev_password@localhost:5432/scf?schema=public';

function createPrisma(): PrismaClient {
  return new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });
}

test.describe('Web · relatorios assincronos', () => {
  test('solicita um relatorio pela interface e mostra na lista com o status', async ({ page }) => {
    const user = await seedUser();
    await loginViaUi(page, user.email, user.password);
    await page.goto('/app/report-jobs');

    await expect(page.getByRole('heading', { name: 'Relatorios assincronos' })).toBeVisible();
    await expect(page.getByText('Nenhum relatorio solicitado.')).toBeVisible();

    await page.getByTestId('relatorio-novo').click();
    await page.getByTestId('relatorio-criar').click();

    const row = page.locator('[data-testid^="relatorio-item-"]');
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('Exportacao de lancamentos');
    await expect(row).toContainText(/Pendente|Processando/);
  });

  test('oferece o download quando o job termina e entrega o CSV pela API', async ({
    page,
    request: apiRequest,
  }) => {
    const user = await seedUser();

    const api = await request.newContext({ baseURL: API_ORIGIN });
    const created = await api.post(`${API_PREFIX}/financial-spaces/${user.spaceId}/reports`, {
      headers: { authorization: `Bearer ${user.accessToken}` },
      data: { type: 'transactions_export', from: '2026-11-01', to: '2026-11-30' },
    });
    expect(created.status()).toBe(201);
    const job = (await created.json()) as { id: string };

    // Sem o worker em execucao o job fica pendente; simulamos o desfecho do
    // processamento gravando o resultado em cache no proprio job.
    const prisma = createPrisma();
    try {
      const csv = '\uFEFFdata,tipo,valor\r\n2026-11-10,expense,100.00';
      await prisma.reportJob.update({
        where: { id: job.id },
        data: {
          status: 'done',
          result: {
            fileName: 'transacoes-2026-11-01_2026-11-30.csv',
            contentType: 'text/csv; charset=utf-8',
            content: csv,
            rowCount: 1,
          },
          rowCount: 1,
          startedAt: new Date(),
          finishedAt: new Date(),
        },
      });

      await loginViaUi(page, user.email, user.password);
      await page.goto('/app/report-jobs');

      const row = page.getByTestId(`relatorio-item-${job.id}`);
      await expect(row).toContainText('Concluido');
      const botao = page.getByTestId(`relatorio-baixar-${job.id}`);
      await expect(botao).toBeVisible();
      await expect(botao).toBeEnabled();
    } finally {
      await prisma.$disconnect();
      await api.dispose();
    }

    // O download em si e validado por uma chamada autenticada a API.
    const download = await apiRequest.get(
      `${API_ORIGIN}${API_PREFIX}/financial-spaces/${user.spaceId}/reports/${job.id}/download`,
      { headers: { authorization: `Bearer ${user.accessToken}` } },
    );
    expect(download.status()).toBe(200);
    expect(download.headers()['content-type']).toContain('text/csv');
    expect(await download.text()).toContain('2026-11-10,expense,100.00');
  });
});

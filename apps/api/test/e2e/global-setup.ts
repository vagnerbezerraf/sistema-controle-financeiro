import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { loadTestEnv, resolveApiRoot } from './utils/env';

/**
 * Garante que o database de teste existe. O Prisma nao cria databases, entao
 * conectamos no database administrativo `postgres` para criar o `scf_test`.
 */
async function ensureDatabaseExists(databaseUrl: string): Promise<void> {
  const url = new URL(databaseUrl);
  const databaseName = url.pathname.replace(/^\//, '');
  const adminUrl = new URL(databaseUrl);
  adminUrl.pathname = '/postgres';

  const admin = new PrismaClient({ datasourceUrl: adminUrl.toString() });
  try {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
    console.log(`[e2e] database "${databaseName}" criado`);
  } catch (error) {
    // 42P04 = duplicate_database. Qualquer outro codigo indica Postgres fora do ar.
    const pgCode =
      (error as { meta?: { code?: string } })?.meta?.code ??
      (error as { code?: string })?.code;
    if (pgCode !== '42P04') throw error;
  } finally {
    await admin.$disconnect();
  }
}

/** Aplica as migrations pendentes no database de teste. */
function runMigrations(apiRoot: string): void {
  execSync('pnpm exec prisma migrate deploy', {
    cwd: apiRoot,
    stdio: 'inherit',
    env: { ...process.env },
  });
}

export default async function setup(): Promise<void> {
  loadTestEnv();
  const apiRoot = resolveApiRoot();
  await ensureDatabaseExists(process.env.DATABASE_URL as string);
  runMigrations(apiRoot);
}

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';

/**
 * Descobre a raiz de `apps/api` subindo a partir do cwd. Isso evita depender de
 * `__dirname`, que nao existe quando o Vitest transforma os arquivos em ESM.
 */
export function resolveApiRoot(): string {
  const candidates = [
    process.cwd(),
    resolve(process.cwd(), '..'),
    resolve(process.cwd(), '..', '..'),
  ];
  for (const dir of candidates) {
    if (existsSync(join(dir, 'prisma', 'schema.prisma'))) return dir;
  }
  throw new Error(
    `Nao foi possivel localizar apps/api (prisma/schema.prisma) a partir de ${process.cwd()}`,
  );
}

/**
 * Carrega `.env.test`. Os valores de teste sobrescrevem o que ja existir no
 * ambiente (inclusive o `.env` de desenvolvimento lido depois pelo ConfigModule,
 * que nunca sobrescreve `process.env`).
 */
export function loadTestEnv(): void {
  const apiRoot = resolveApiRoot();
  loadDotenv({ path: join(apiRoot, '.env.test'), override: true });

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL nao definida: verifique apps/api/.env.test');
  }
  if (!process.env.DATABASE_URL.includes('scf_test')) {
    throw new Error(
      `Os testes E2E truncam o banco e por isso exigem o database scf_test. Recebido: ${process.env.DATABASE_URL}`,
    );
  }
}

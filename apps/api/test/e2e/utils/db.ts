import { PrismaClient } from '@prisma/client';

/**
 * Trunca todas as tabelas de dominio (exceto o controle interno do Prisma).
 * Descobrimos as tabelas em tempo de execucao para nao quebrar quando o schema
 * ganhar novas entidades.
 */
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '\\_prisma%'
  `;
  if (tables.length === 0) return;

  const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} CASCADE`);
}

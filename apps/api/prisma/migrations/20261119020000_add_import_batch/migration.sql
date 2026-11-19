-- Migration: 20261119020000_add_import_batch
-- Importacao de extrato (CSV): lote persistido para previa, aplicacao,
-- auditoria e desfazer. Guarda o texto de origem (reexecucao do commit
-- idempotente) e os ids das transacoes criadas (cancelamento logico no undo).
-- Escrita manualmente (DDL no mesmo estilo das demais migracoes) para ficar
-- restrita ao escopo da mudanca.

CREATE TYPE "ImportBatchStatus" AS ENUM ('previewed', 'committed', 'undone');

CREATE TABLE "import_batches" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "financialSpaceId" UUID NOT NULL REFERENCES "financial_spaces"("id") ON DELETE CASCADE,
  "accountId" UUID NOT NULL,
  "status" "ImportBatchStatus" NOT NULL DEFAULT 'previewed',
  "fileName" VARCHAR(255),
  "sourceText" TEXT NOT NULL,
  "rowCount" INTEGER NOT NULL DEFAULT 0,
  "validCount" INTEGER NOT NULL DEFAULT 0,
  "invalidCount" INTEGER NOT NULL DEFAULT 0,
  "duplicateCount" INTEGER NOT NULL DEFAULT 0,
  "importedCount" INTEGER NOT NULL DEFAULT 0,
  "createdTransactionIds" TEXT[] NOT NULL DEFAULT '{}',
  "committedAt" TIMESTAMPTZ,
  "undoneAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX "import_batches_financialSpaceId_status_createdAt_idx" ON "import_batches"("financialSpaceId", "status", "createdAt");

-- Migration: 20261121000000_add_attachment
-- Comprovantes (recibos/documentos) anexados a uma transacao. O arquivo fica no
-- storage (identificado por "storageKey"); aqui guardamos os metadados e o
-- "checksum" (SHA-256) do conteudo, para auditoria e deduplicacao.
-- Escrita manualmente (DDL no mesmo estilo das demais migracoes) para ficar
-- restrita ao escopo da mudanca.

CREATE TABLE "attachments" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "financialSpaceId" UUID NOT NULL REFERENCES "financial_spaces"("id") ON DELETE CASCADE,
  "transactionId" UUID NOT NULL REFERENCES "transactions"("id") ON DELETE CASCADE,
  "fileName" VARCHAR(255) NOT NULL,
  "contentType" VARCHAR(120) NOT NULL,
  "size" INTEGER NOT NULL,
  "storageKey" VARCHAR(512) NOT NULL,
  "checksum" VARCHAR(64) NOT NULL,
  "uploadedBy" UUID,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX "attachments_financialSpaceId_transactionId_idx" ON "attachments"("financialSpaceId", "transactionId");
CREATE INDEX "attachments_financialSpaceId_checksum_idx" ON "attachments"("financialSpaceId", "checksum");

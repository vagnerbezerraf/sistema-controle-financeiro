-- Migration: 20261121130000_add_report_job
-- Relatorios assincronos (Fase 5): o pedido e gravado com status "pending" e um
-- evento no outbox na MESMA transacao; o worker consome o evento, gera o
-- conteudo e o guarda em "result" (JSON, em cache), passando o status para
-- "done" (ou "error" com o motivo em "error"). "params" guarda os filtros.
-- Escrita manualmente (DDL no mesmo estilo das demais migracoes).

CREATE TYPE "ReportJobType" AS ENUM ('transactions_export');

CREATE TYPE "ReportJobStatus" AS ENUM ('pending', 'running', 'done', 'error');

CREATE TABLE "report_jobs" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "financialSpaceId" UUID NOT NULL REFERENCES "financial_spaces"("id") ON DELETE CASCADE,
  "type" "ReportJobType" NOT NULL,
  "status" "ReportJobStatus" NOT NULL DEFAULT 'pending',
  "params" JSONB NOT NULL,
  "result" JSONB,
  "rowCount" INTEGER,
  "error" TEXT,
  "requestedBy" UUID,
  "startedAt" TIMESTAMPTZ,
  "finishedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX "report_jobs_financialSpaceId_status_createdAt_idx"
  ON "report_jobs"("financialSpaceId", "status", "createdAt");

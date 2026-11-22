-- Migration: 20261122010000_add_open_finance_sync
-- Open Finance (Fase 5): estado da sincronizacao incremental no consentimento.
-- Guardamos a conta de destino dos lancamentos, o cursor da proxima leitura no
-- agregador, o momento da ultima sincronizacao e os identificadores externos ja
-- importados (para deduplicar leituras sobrepostas). Escrita manualmente, no
-- mesmo estilo das demais migracoes, para ficar restrita ao escopo da mudanca.

ALTER TABLE "open_finance_consents"
  ADD COLUMN "targetAccountId" UUID,
  ADD COLUMN "syncCursor" VARCHAR(200),
  ADD COLUMN "lastSyncedAt" TIMESTAMPTZ,
  ADD COLUMN "syncedExternalIds" TEXT[] NOT NULL DEFAULT '{}';

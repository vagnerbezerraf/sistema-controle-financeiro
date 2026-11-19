-- Migration: 20261119030000_add_import_batch_format
-- Importacao de extrato: registra o formato de origem do lote (CSV ou OFX) para
-- que a previa/detalhe/commit escolham o parser correto ao reprocessar o texto
-- guardado. Lotes existentes ficam como `csv`.
-- Escrita manualmente (DDL no mesmo estilo das demais migracoes) para ficar
-- restrita ao escopo da mudanca.

CREATE TYPE "ImportBatchFormat" AS ENUM ('csv', 'ofx');

ALTER TABLE "import_batches"
  ADD COLUMN "format" "ImportBatchFormat" NOT NULL DEFAULT 'csv';

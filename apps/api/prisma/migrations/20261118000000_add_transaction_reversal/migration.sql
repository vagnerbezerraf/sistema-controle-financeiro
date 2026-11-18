-- Migration: 20261118000000_add_transaction_reversal
-- Adiciona o estorno formalizado de transacoes. Quando uma transacao e
-- revertida, `reversedAt` marca o momento e `reversalOfTransactionId` liga a
-- transacao de estorno ao original (relacao auto-referente).
-- Escrita manualmente para ficar restrita ao escopo da mudanca.

ALTER TABLE "transactions" ADD COLUMN "reversedAt" TIMESTAMPTZ;
ALTER TABLE "transactions" ADD COLUMN "reversalReason" TEXT;
ALTER TABLE "transactions" ADD COLUMN "reversalOfTransactionId" UUID;

ALTER TABLE "transactions"
  ADD CONSTRAINT "transactions_reversalOfTransactionId_fkey"
  FOREIGN KEY ("reversalOfTransactionId") REFERENCES "transactions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "transactions_reversalOfTransactionId_key" ON "transactions"("reversalOfTransactionId");

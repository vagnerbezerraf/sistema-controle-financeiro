-- Migration: 20261119000000_add_transaction_installments
-- Compra parcelada: cada transacao passa a poder pertencer a um grupo de
-- parcelas. As N transacoes de uma compra compartilham `installmentGroupId` e
-- se ordenam por `installmentNumber` (1..installmentCount).
-- Escrita manualmente para ficar restrita ao escopo da mudanca.

ALTER TABLE "transactions" ADD COLUMN "installmentGroupId" UUID;
ALTER TABLE "transactions" ADD COLUMN "installmentNumber" INTEGER;
ALTER TABLE "transactions" ADD COLUMN "installmentCount" INTEGER;

CREATE INDEX "transactions_installmentGroupId_idx" ON "transactions"("installmentGroupId");

-- Migration: 20261119010000_add_recurrence_and_obligations
-- Recorrencias e contas a pagar/receber:
-- 1) `version` nas regras de recorrencia e nas obrigacoes, alinhando-as a
--    convencao de concorrencia otimista dos outros recursos editaveis.
-- 2) indice unico por (regra, vencimento): e o que torna a materializacao das
--    ocorrencias idempotente (reexecutar a geracao nao duplica obrigacoes).
-- Escrita manualmente para ficar restrita ao escopo da mudanca.

ALTER TABLE "recurrence_rules" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "obligations" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "obligations_recurrenceRuleId_dueDate_key" ON "obligations"("recurrenceRuleId", "dueDate");

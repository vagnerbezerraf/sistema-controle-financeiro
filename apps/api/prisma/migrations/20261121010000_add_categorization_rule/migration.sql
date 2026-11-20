-- Migration: 20261121010000_add_categorization_rule
-- Regras de categorizacao automatica (Fase 5): casam a descricao do lancamento
-- por um padrao textual e atribuem uma categoria. Precedencia por "priority"
-- (menor primeiro); "state" arquivado deixa de ser aplicada. Aplicadas no commit
-- da importacao e por uma acao retroativa explicita.
-- Escrita manualmente (DDL no mesmo estilo das demais migracoes) para ficar
-- restrita ao escopo da mudanca.

CREATE TYPE "RuleMatchType" AS ENUM ('contains', 'equals', 'startsWith');

CREATE TABLE "categorization_rules" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "financialSpaceId" UUID NOT NULL REFERENCES "financial_spaces"("id") ON DELETE CASCADE,
  "name" VARCHAR(120) NOT NULL,
  "matchType" "RuleMatchType" NOT NULL,
  "pattern" VARCHAR(200) NOT NULL,
  "categoryId" UUID NOT NULL REFERENCES "categories"("id") ON DELETE CASCADE,
  "type" "TransactionType",
  "priority" INTEGER NOT NULL DEFAULT 100,
  "state" "EntityState" NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "version" INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX "categorization_rules_financialSpaceId_state_priority_idx" ON "categorization_rules"("financialSpaceId", "state", "priority");
CREATE INDEX "categorization_rules_financialSpaceId_categoryId_idx" ON "categorization_rules"("financialSpaceId", "categoryId");

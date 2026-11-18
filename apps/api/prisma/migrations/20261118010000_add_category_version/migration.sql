-- Concorrencia otimista: a categoria passa a ter a mesma coluna `version` que
-- Account/Transaction/FinancialSpace usam no UPDATE condicional (If-Match logico).
ALTER TABLE "categories" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

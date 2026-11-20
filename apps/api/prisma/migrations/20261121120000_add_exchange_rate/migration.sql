-- Migration: 20261121120000_add_exchange_rate
-- Multiplas moedas (Fase 5): taxa de cambio por par (fromCurrency -> toCurrency)
-- dentro de um espaco financeiro. Uma taxa vale a partir de "asOf" inclusive
-- ate ser substituida por outra mais recente do mesmo par; a conversao dos
-- totais consolidados usa a taxa vigente na data do lancamento. "rate" e quantas
-- unidades de "toCurrency" valem 1 de "fromCurrency".
-- Escrita manualmente (DDL no mesmo estilo das demais migracoes) para ficar
-- restrita ao escopo da mudanca. O enum "CurrencyCode" ja existe desde o init.

CREATE TABLE "exchange_rates" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "financialSpaceId" UUID NOT NULL REFERENCES "financial_spaces"("id") ON DELETE CASCADE,
  "fromCurrency" "CurrencyCode" NOT NULL,
  "toCurrency" "CurrencyCode" NOT NULL,
  "rate" NUMERIC(19, 4) NOT NULL,
  "asOf" DATE NOT NULL,
  "source" VARCHAR(120),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "version" INTEGER NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX "exchange_rates_financialSpaceId_fromCurrency_toCurrency_asOf_key"
  ON "exchange_rates"("financialSpaceId", "fromCurrency", "toCurrency", "asOf");

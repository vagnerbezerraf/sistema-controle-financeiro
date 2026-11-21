-- Migration: 20261122000000_add_open_finance_consent
-- Open Finance (Fase 5): consentimento de um espaco financeiro com uma
-- instituicao no agregador. Guardamos o identificador externo (do provedor) e a
-- situacao; a URL de autorizacao e devolvida para o usuario concluir o fluxo
-- hospedado fora do app. Um consentimento por instituicao e espaco.
-- Escrita manualmente (DDL no mesmo estilo das demais migracoes) para ficar
-- restrita ao escopo da mudanca.

CREATE TYPE "OpenFinanceConsentStatus" AS ENUM ('pending', 'authorized', 'rejected', 'expired', 'revoked');

CREATE TABLE "open_finance_consents" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "financialSpaceId" UUID NOT NULL REFERENCES "financial_spaces"("id") ON DELETE CASCADE,
  "institutionId" VARCHAR(120) NOT NULL,
  "institutionName" VARCHAR(200) NOT NULL,
  "status" "OpenFinanceConsentStatus" NOT NULL DEFAULT 'pending',
  "externalId" VARCHAR(200),
  "consentUrl" TEXT,
  "expiresAt" TIMESTAMPTZ,
  "revokedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "version" INTEGER NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX "open_finance_consents_financialSpaceId_institutionId_key"
  ON "open_finance_consents"("financialSpaceId", "institutionId");
CREATE INDEX "open_finance_consents_financialSpaceId_status_idx"
  ON "open_finance_consents"("financialSpaceId", "status");

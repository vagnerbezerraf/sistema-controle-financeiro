-- Migration: 20261106000000_add_mfa_and_password_reset
-- Adiciona suporte a MFA (TOTP + codigos de recuperacao) e recuperacao de
-- senha ao modulo de identidade. Escrita manualmente para ficar restrita ao
-- escopo da mudanca (o `migrate diff` gerava uma reconciliacao completa).

ALTER TABLE "users" ADD COLUMN "mfaSecret" TEXT;
ALTER TABLE "users" ADD COLUMN "mfaEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "mfaRecoveryCodes" TEXT[] NOT NULL DEFAULT '{}';

CREATE TABLE "password_reset_tokens" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "userId" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "tokenHash" TEXT NOT NULL UNIQUE,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "usedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON "password_reset_tokens"("userId");

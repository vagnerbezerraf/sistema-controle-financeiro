-- Migration: 0001_init_schema
-- Criado manualmente a partir do Prisma schema.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

-- Enums
CREATE TYPE "CurrencyCode" AS ENUM ('BRL', 'USD', 'EUR', 'ARS', 'GBP', 'JPY');
CREATE TYPE "FinancialSpaceState" AS ENUM ('active', 'archived');
CREATE TYPE "FinancialSpaceRole" AS ENUM ('owner', 'admin', 'contributor', 'viewer');
CREATE TYPE "MembershipStatus" AS ENUM ('active', 'invited', 'revoked');
CREATE TYPE "AccountType" AS ENUM ('checking', 'savings', 'cash', 'wallet', 'credit_card', 'investment');
CREATE TYPE "CategoryType" AS ENUM ('income', 'expense', 'both');
CREATE TYPE "EntityState" AS ENUM ('active', 'archived');
CREATE TYPE "TransactionType" AS ENUM ('income', 'expense', 'transfer', 'adjustment');
CREATE TYPE "TransactionStatus" AS ENUM ('scheduled', 'pending', 'confirmed', 'canceled');
CREATE TYPE "PostingDirection" AS ENUM ('debit', 'credit');
CREATE TYPE "ObligationStatus" AS ENUM ('forecast', 'pending', 'partially_reconciled', 'reconciled', 'overdue', 'ignored', 'canceled');

CREATE TABLE "users" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "email" CITEXT NOT NULL UNIQUE,
  "emailVerifiedAt" TIMESTAMPTZ,
  "name" VARCHAR(120),
  "passwordHash" VARCHAR(255),
  "oidcSub" VARCHAR(255) UNIQUE,
  "timezone" VARCHAR(64) NOT NULL DEFAULT 'America/Sao_Paulo',
  "locale" VARCHAR(16) NOT NULL DEFAULT 'pt-BR',
  "pictureUrl" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "lastLoginAt" TIMESTAMPTZ
);

CREATE TABLE "financial_spaces" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "name" VARCHAR(120) NOT NULL,
  "primaryCurrency" "CurrencyCode" NOT NULL DEFAULT 'BRL',
  "timezone" VARCHAR(64) NOT NULL DEFAULT 'America/Sao_Paulo',
  "state" "FinancialSpaceState" NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "version" INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE "memberships" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "financialSpaceId" UUID NOT NULL REFERENCES "financial_spaces"("id") ON DELETE CASCADE,
  "userId" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" "FinancialSpaceRole" NOT NULL DEFAULT 'contributor',
  "status" "MembershipStatus" NOT NULL DEFAULT 'active',
  "invitedEmail" VARCHAR(254),
  "invitedAt" TIMESTAMPTZ,
  "inviteAcceptedAt" TIMESTAMPTZ,
  "revokedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("financialSpaceId", "userId")
);
CREATE INDEX ON "memberships"("userId", "status");

CREATE TABLE "accounts" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "financialSpaceId" UUID NOT NULL REFERENCES "financial_spaces"("id") ON DELETE CASCADE,
  "name" VARCHAR(120) NOT NULL,
  "type" "AccountType" NOT NULL,
  "currency" "CurrencyCode" NOT NULL DEFAULT 'BRL',
  "initialBalance" NUMERIC(19, 4) NOT NULL DEFAULT 0,
  "initialBalanceDate" DATE NOT NULL,
  "institution" VARCHAR(120),
  "branch" VARCHAR(32),
  "number" VARCHAR(64),
  "color" VARCHAR(16),
  "icon" VARCHAR(64),
  "state" "EntityState" NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "version" INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX ON "accounts"("financialSpaceId", "state", "type");

CREATE TABLE "categories" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "financialSpaceId" UUID NOT NULL REFERENCES "financial_spaces"("id") ON DELETE CASCADE,
  "name" VARCHAR(80) NOT NULL,
  "type" "CategoryType" NOT NULL,
  "color" VARCHAR(16),
  "icon" VARCHAR(64),
  "parentId" UUID REFERENCES "categories"("id") ON DELETE SET NULL,
  "state" "EntityState" NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("financialSpaceId", "name", "parentId")
);
CREATE INDEX ON "categories"("financialSpaceId", "type", "state");

CREATE TABLE "transactions" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "financialSpaceId" UUID NOT NULL REFERENCES "financial_spaces"("id") ON DELETE CASCADE,
  "type" "TransactionType" NOT NULL,
  "status" "TransactionStatus" NOT NULL DEFAULT 'confirmed',
  "description" VARCHAR(250) NOT NULL,
  "notes" TEXT,
  "categoryId" UUID REFERENCES "categories"("id") ON DELETE SET NULL,
  "currency" "CurrencyCode" NOT NULL DEFAULT 'BRL',
  "totalAmount" NUMERIC(19, 4) NOT NULL,
  "effectiveDate" DATE NOT NULL,
  "dueDate" DATE,
  "tags" TEXT[] NOT NULL DEFAULT '{}',
  "version" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "idempotencyKey" VARCHAR(128),
  UNIQUE ("financialSpaceId", "idempotencyKey")
);
CREATE INDEX ON "transactions"("financialSpaceId", "effectiveDate", "status", "type");
CREATE INDEX ON "transactions"("financialSpaceId", "categoryId");

CREATE TABLE "postings" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "transactionId" UUID NOT NULL REFERENCES "transactions"("id") ON DELETE CASCADE,
  "accountId" UUID NOT NULL REFERENCES "accounts"("id") ON DELETE RESTRICT,
  "amount" NUMERIC(19, 4) NOT NULL,
  "direction" "PostingDirection" NOT NULL,
  "effectiveDate" DATE NOT NULL
);
CREATE INDEX ON "postings"("accountId", "effectiveDate");
CREATE INDEX ON "postings"("transactionId");

CREATE TABLE "credit_cards" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "accountId" UUID NOT NULL UNIQUE REFERENCES "accounts"("id") ON DELETE CASCADE,
  "name" VARCHAR(120) NOT NULL,
  "limit" NUMERIC(19, 4) NOT NULL,
  "closingDay" INTEGER NOT NULL,
  "dueDay" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE "invoices" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "creditCardId" UUID NOT NULL REFERENCES "credit_cards"("id") ON DELETE CASCADE,
  "cycleStart" DATE NOT NULL,
  "cycleEnd" DATE NOT NULL,
  "closingDate" DATE NOT NULL,
  "dueDate" DATE NOT NULL,
  "totalAmount" NUMERIC(19, 4) NOT NULL DEFAULT 0,
  "paidAmount" NUMERIC(19, 4) NOT NULL DEFAULT 0,
  "status" VARCHAR(32) NOT NULL DEFAULT 'open',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON "invoices"("creditCardId", "cycleStart", "status");

CREATE TABLE "recurrence_rules" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "financialSpaceId" UUID NOT NULL REFERENCES "financial_spaces"("id") ON DELETE CASCADE,
  "frequency" VARCHAR(32) NOT NULL,
  "interval" INTEGER NOT NULL DEFAULT 1,
  "startDate" DATE NOT NULL,
  "endDate" DATE,
  "occurrencesLimit" INTEGER,
  "template" JSONB NOT NULL,
  "timezone" VARCHAR(64) NOT NULL DEFAULT 'America/Sao_Paulo',
  "state" "EntityState" NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE "obligations" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "financialSpaceId" UUID NOT NULL REFERENCES "financial_spaces"("id") ON DELETE CASCADE,
  "recurrenceRuleId" UUID REFERENCES "recurrence_rules"("id") ON DELETE SET NULL,
  "status" "ObligationStatus" NOT NULL DEFAULT 'forecast',
  "type" VARCHAR(64) NOT NULL,
  "description" VARCHAR(250) NOT NULL,
  "currency" "CurrencyCode" NOT NULL DEFAULT 'BRL',
  "amount" NUMERIC(19, 4) NOT NULL,
  "dueDate" DATE NOT NULL,
  "transactionId" UUID REFERENCES "transactions"("id") ON DELETE SET NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON "obligations"("financialSpaceId", "dueDate", "status");

CREATE TABLE "budgets" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "financialSpaceId" UUID NOT NULL REFERENCES "financial_spaces"("id") ON DELETE CASCADE,
  "periodStart" DATE NOT NULL,
  "periodEnd" DATE NOT NULL,
  "categoryId" UUID REFERENCES "categories"("id") ON DELETE SET NULL,
  "amountLimit" NUMERIC(19, 4) NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("financialSpaceId", "periodStart", "periodEnd", "categoryId")
);

CREATE TABLE "goals" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "financialSpaceId" UUID NOT NULL REFERENCES "financial_spaces"("id") ON DELETE CASCADE,
  "name" VARCHAR(120) NOT NULL,
  "targetAmount" NUMERIC(19, 4) NOT NULL,
  "currentAmount" NUMERIC(19, 4) NOT NULL DEFAULT 0,
  "deadline" DATE,
  "color" VARCHAR(16),
  "icon" VARCHAR(64),
  "state" "EntityState" NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE "idempotency_records" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "financialSpaceId" UUID NOT NULL,
  "idempotencyKey" VARCHAR(128) NOT NULL,
  "clientId" VARCHAR(128),
  "requestFingerprint" VARCHAR(512) NOT NULL,
  "responsePayload" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "expiresAt" TIMESTAMPTZ,
  UNIQUE ("financialSpaceId", "idempotencyKey")
);
CREATE INDEX ON "idempotency_records"("expiresAt");

CREATE TABLE "audit_logs" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "financialSpaceId" UUID REFERENCES "financial_spaces"("id") ON DELETE SET NULL,
  "userId" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "correlationId" VARCHAR(128),
  "operation" VARCHAR(64) NOT NULL,
  "entityType" VARCHAR(64) NOT NULL,
  "entityId" VARCHAR(64) NOT NULL,
  "safeSummary" JSONB,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON "audit_logs"("financialSpaceId", "entityType", "createdAt");
CREATE INDEX ON "audit_logs"("userId", "createdAt");

CREATE TABLE "outbox_events" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "financialSpaceId" UUID NOT NULL REFERENCES "financial_spaces"("id") ON DELETE CASCADE,
  "eventType" VARCHAR(128) NOT NULL,
  "payload" JSONB NOT NULL,
  "status" VARCHAR(32) NOT NULL DEFAULT 'pending',
  "publishedAt" TIMESTAMPTZ,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMPTZ,
  "lastError" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON "outbox_events"("status", "nextAttemptAt");

-- Trigger para updatedAt automatico
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['users','financial_spaces','memberships','accounts','categories','transactions','credit_cards','invoices','recurrence_rules','obligations','budgets','goals']
  LOOP
    EXECUTE format(
      'CREATE TRIGGER set_updated_at_%I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at();',
      t, t
    );
  END LOOP;
END;
$$;

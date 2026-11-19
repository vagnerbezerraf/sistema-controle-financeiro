-- Migration: 20261120000000_add_space_invite
-- Espacos familiares: convite por e-mail com token, papel e validade. Substitui
-- o cadastro direto de membro (que exigia um usuario existente) por um fluxo de
-- convite aceito pelo convidado, que so entao cria a Membership.
-- Escrita manualmente (DDL no mesmo estilo das demais migracoes) para ficar
-- restrita ao escopo da mudanca.

CREATE TYPE "SpaceInviteStatus" AS ENUM ('pending', 'accepted', 'revoked', 'expired');

CREATE TABLE "space_invites" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "financialSpaceId" UUID NOT NULL REFERENCES "financial_spaces"("id") ON DELETE CASCADE,
  "email" VARCHAR(320) NOT NULL,
  "role" "FinancialSpaceRole" NOT NULL DEFAULT 'contributor',
  "status" "SpaceInviteStatus" NOT NULL DEFAULT 'pending',
  "tokenHash" VARCHAR(64) NOT NULL,
  "invitedById" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "acceptedAt" TIMESTAMPTZ,
  "revokedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX "space_invites_tokenHash_key" ON "space_invites"("tokenHash");
CREATE UNIQUE INDEX "space_invites_financialSpaceId_email_key" ON "space_invites"("financialSpaceId", "email");
CREATE INDEX "space_invites_email_status_idx" ON "space_invites"("email", "status");

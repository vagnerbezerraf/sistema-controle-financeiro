-- Migration: 20261120010000_add_notification_preference
-- Preferencias de privacidade e notificacao por usuario: matriz de canais por
-- tipo de notificacao (JSON), horario silencioso e exibicao de valores nas
-- notificacoes. Uma linha por usuario, criada sob demanda na primeira leitura.
-- Escrita manualmente (DDL no mesmo estilo das demais migracoes) para ficar
-- restrita ao escopo da mudanca.

CREATE TABLE "notification_preferences" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "userId" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "channels" JSONB NOT NULL,
  "quietHoursEnabled" BOOLEAN NOT NULL DEFAULT false,
  "quietHoursStart" VARCHAR(5) NOT NULL DEFAULT '22:00',
  "quietHoursEnd" VARCHAR(5) NOT NULL DEFAULT '07:00',
  "includeAmounts" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX "notification_preferences_userId_key" ON "notification_preferences"("userId");

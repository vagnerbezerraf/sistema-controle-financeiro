# syntax=docker/dockerfile:1.7
# Imagem da API (@scf/api). Build multi-stage no contexto do monorepo pnpm.

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=/pnpm:$PATH
# openssl e necessario para o engine do Prisma detectar a libssl corretamente.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

# --- Dependencias -----------------------------------------------------------
FROM base AS deps
ENV CI=true
# Copiamos apenas os manifestos para aproveitar o cache de camadas do Docker.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc turbo.json ./
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
COPY apps/mobile/package.json apps/mobile/
COPY apps/desktop/package.json apps/desktop/
COPY packages/api-contracts/package.json packages/api-contracts/
COPY packages/validation/package.json packages/validation/
COPY packages/design-tokens/package.json packages/design-tokens/
COPY packages/config/package.json packages/config/
RUN pnpm install --frozen-lockfile

# --- Build ------------------------------------------------------------------
FROM deps AS build
COPY . .
# Com node-linker=hoisted, o @prisma/client fica na raiz e seu postinstall (sem
# schema no estagio de deps) cria um stub em node_modules/.prisma/client que
# sombreia o client real. Geramos o client e copiamos para a raiz para que os
# tipos (tsc) e o runtime resolvam o client correto.
RUN pnpm --filter @scf/api db:generate \
 && rm -rf node_modules/.prisma \
 && cp -a apps/node_modules/.prisma node_modules/.prisma \
 && pnpm --filter @scf/api build

# --- Runtime ----------------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production
ENV API_HOST=0.0.0.0
ENV API_PORT=3001
# Com node-linker=hoisted os binarios ficam em node_modules/.bin da raiz; sem
# isso o prisma CLI (usado pelo servico de migracao) nao seria encontrado.
ENV PATH=/app/node_modules/.bin:$PATH
# node_modules hoisted do workspace + o cliente Prisma em apps/node_modules.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/node_modules ./apps/node_modules
COPY --from=build /app/apps/api ./apps/api
COPY --from=build /app/packages ./packages
# Necessario para scripts que usam ts-node (ex.: seed), pois o tsconfig da app
# estende o tsconfig.base.json da raiz do monorepo.
COPY --from=build /app/tsconfig.base.json ./tsconfig.base.json
WORKDIR /app/apps/api
EXPOSE 3001
# As migracoes devem ser aplicadas pelo orquestrador (ver docker-compose.staging.yml).
CMD ["node", "dist/src/main.js"]

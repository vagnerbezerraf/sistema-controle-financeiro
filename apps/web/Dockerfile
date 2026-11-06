# syntax=docker/dockerfile:1.7
# Imagem do Web (@scf/web, Next.js). Build multi-stage no contexto do monorepo.

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=/pnpm:$PATH
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

# --- Dependencias -----------------------------------------------------------
FROM base AS deps
ENV CI=true
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
# A URL da API e embutida no bundle do cliente em tempo de build.
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:3001/api/v1
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
COPY . .
RUN pnpm --filter @scf/web build

# --- Runtime ----------------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production
# Com node-linker=hoisted os binarios ficam em node_modules/.bin da raiz; sem
# isso o `next` nao seria encontrado ao iniciar o servidor.
ENV PATH=/app/node_modules/.bin:$PATH
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/web ./apps/web
COPY --from=build /app/packages ./packages
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["pnpm", "run", "start"]

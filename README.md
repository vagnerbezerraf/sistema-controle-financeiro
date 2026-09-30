# Sistema de Controle Financeiro (SCF)

> Monorepo multi-app: API (NestJS + Prisma), Web (Next.js), Mobile (Expo), Desktop (Tauri + React), Worker (BullMQ/Redis) e pacotes compartilhados.

## 1. Visão geral

Aplicação pessoal/familiar de controle financeiro com **multi-plataforma**: web, mobile e desktop consumindo a mesma API REST. Backend modular, PostgreSQL como fonte oficial dos dados, Redis para jobs em background.

- Moeda padrão: **BRL** (estrutura preparada para multi-moeda).
- Valores monetários: **decimal string (4 casas)**; nunca `number`/ponto flutuante.
- Três fluxos de lançamento: **previsão (recorrência) → obrigação (vencimento) → transação efetivada (posting)**.
- Suporte a múltiplos espaços financeiros (individual + familiar) com roles por membro.

## 2. Stack por módulo

| Módulo | O que é | Stack |
|---|---|---|
| `@scf/api` | Backend REST + OpenAPI/Swagger | **NestJS 10**, **Prisma 5**, JWT, Zod (nestjs-zod), CQRS, Helmet, Rate Limit |
| `@scf/worker` | Jobs em background (notificações, recorrências, exportações, outbox) | **BullMQ 5** + **ioredis** + Pino logger |
| `@scf/web` | Aplicação web principal | **Next.js 15** (App Router) + **React 19** + TanStack Query + React Hook Form + Dinero.js |
| `@scf/mobile` | Aplicativo móvel | **Expo 52**, **Expo Router 4**, React Native 0.76, NativeWind (Tailwind), Secure Store |
| `@scf/desktop` | Aplicativo desktop (Windows/macOS/Linux) | **React 19** + Vite + **Tauri 2** (camada nativa Rust) |
| `@scf/validation` | Schemas Zod compartilhados | Zod + tipos inferidos (`MoneyAmount`, `IsoDate`, `IsoDateTime`, `UuidSchema`, `CurrencyCode`) |
| `@scf/api-contracts` | Tipos/DTOs compartilhados front ↔ back | TypeScript interfaces: `DashboardSummary`, `AuthResponse`, etc. |
| `@scf/design-tokens` | Identidade visual compartilhada | Tokens: cores, espaçamentos, raios, fontes, sombras, breakpoints |
| `@scf/config` | Configurações base | `tsconfig.*.json` (base/next/node/react), ESLint 9 flat, Prettier |

## 3. Estrutura do monorepo

```
sistema-controle-financeiro/
├── apps/
│   ├── api/             # NestJS + Prisma (src/domain, application, infrastructure)
│   ├── worker/          # BullMQ worker
│   ├── web/             # Next.js 15
│   ├── mobile/          # Expo 52 (Expo Router file-based: app/)
│   └── desktop/         # React + Vite + Tauri 2 (src-tauri/)
├── packages/
│   ├── validation/      # Schemas Zod
│   ├── api-contracts/   # DTOs / tipos compartilhados
│   ├── design-tokens/   # Design tokens
│   └── config/          # tsconfig, eslint, prettier
├── infra/               # Scripts e arquivos de infra (init.sql do Postgres, etc.)
├── doc/                 # Documentação de produto e arquitetura (README + 8 documentos)
├── docker-compose.yml   # Postgres 17, Redis 7, MailHog (smtp trap)
├── turbo.json           # Tasks do Turborepo
├── pnpm-workspace.yaml  # Workspaces: apps/*, packages/*
├── .npmrc               # pnpm: store/cache/state LOCAIS (não usa GDrive!) + hoisting
└── .env.example
```

## 4. Pré-requisitos

| Ferramenta | Versão mínima | Onde checar |
|---|---|---|
| Node.js | `>= 22.0.0` | `node --version` |
| pnpm | `>= 9.0.0` | `pnpm --version` |
| Docker Engine + Compose | (versão recente) | `docker --version` ; `docker compose version` |
| (Opcional) Rust toolchain | 1.80+ (Tauri 2) | Só para compilar o desktop com shell nativo |
| (Opcional) Expo Go/Android Studio/Xcode | | Só para rodar o mobile em device/emulador |

## 5. Como rodar — passo a passo

### 5.1 Instalação + banco

```bash
# 1. Instalar dependências (1594 pacotes, hoisted, caches LOCAIS no projeto)
pnpm install

# 2. Copiar .env de exemplo (API) — valores padrão já batem com docker-compose.yml
cp .env.example apps/api/.env
#   (já existe apps/api/.env pronto para desenvolvimento local; ajuste se precisar)

# 3. Subir PostgreSQL + Redis (opcional: profile full)
docker compose up -d postgres redis        # Postgres obrigatório, Redis opcional (worker só)
# ou: docker compose --profile full up -d   # Postgres + Redis + MailHog trap

# 4. Gerar Prisma Client + aplicar migrations
pnpm db:generate      # Gera Prisma Client local em apps/api/node_modules/@prisma/client
pnpm db:migrate       # Executa migrations no PostgreSQL (arquivos em apps/api/prisma/migrations)
```

### 5.2 Executar em modo desenvolvimento

```bash
# TUDO em paralelo (API + Web + Mobile + Worker + Desktop — CUIDADO: portas simultâneas!):
pnpm dev

# Ou rodar APENAS o que você precisa (RECOMENDADO):
pnpm dev:api          # API       →  http://localhost:3001  (Swagger /api/docs)
pnpm dev:web          # Web       →  http://localhost:3000
pnpm dev:desktop      # Desktop   →  Tauri dev launcher (porta vite 5173 + Tauri)
cd apps/mobile && pnpm start   # Mobile → Expo dev → escanear QR com Expo Go
```

### 5.3 Seed de categorias padrão (opcional)

```bash
pnpm --filter @scf/api db:seed
```

## 6. Comandos úteis (raiz do monorepo, via Turborepo)

```bash
pnpm build            # Build de TODOS apps/packages
pnpm typecheck        # tsc --noEmit em TODOS workspaces (8/8 successful = ok)
pnpm lint             # ESLint em TODOS workspaces
pnpm test             # Vitest em TODOS
pnpm test:unit        # Vitest unit-only

# Banco de dados (escarva apenas @scf/api):
pnpm db:generate      # prisma generate
pnpm db:migrate       # prisma migrate dev
pnpm db:studio        # prisma studio → GUI browser em http://localhost:5555

# Limpar caches/artifacts
pnpm clean
```

## 7. Portas padrão

| Serviço | Porta | Observação |
|---|---|---|
| API (Nest) | **3001** | Swagger/OpenAPI em `http://localhost:3001/api` |
| Web (Next.js) | **3000** | |
| Desktop (Vite dev) | **5173** | Tauri 2 embarca internamente |
| Mobile (Metro bundler) | **8081** | Expo gerencia |
| PostgreSQL | **5432** | user `scf`, senha `scf_dev_password`, db `scf` |
| Redis (opcional) | **6379** | Senha `scf_redis_secret` |
| MailHog SMTP (opcional) | **1025** | Trap de e-mails em desenvolvimento |
| MailHog Web (opcional) | **8025** | Inbox web |
| Prisma Studio | **5555** | `pnpm db:studio` |

## 8. Conceitos chave do domínio financeiro

| Conceito | O que é |
|---|---|
| **User** | Usuário autenticado (e-mail + senha / OIDC / futuras integrações) |
| **FinancialSpace** | "Carteira" / espaço financeiro. Um User pode ter N espaços (individual + familiar). Estado: `active \| archived` |
| **Membership + FinancialSpaceRole** | Vínculo User ↔ Space: `owner`, `admin`, `editor`, `viewer`, `auditor`. Usado por `SpaceRoleGuard` do NestJS |
| **Account** | Conta financeira: `cash`, `checking`, `savings`, `credit_card`, `investment`, `prepaid`, `loan` |
| **Category** | Classificador de lançamentos: `income`, `expense`, **`both`** (ex: transferências). Estado `active \| hidden \| archived` |
| **Transaction + Posting** | Transação = cabeçalho; Posting = movimento per-conta (suporta split/rateio multi-categoria/destino). Tipos `income \| expense \| transfer \| adjustment \| exchange`. Status `draft \| pending \| cleared \| reconciled \| void` |
| **CreditCard + Invoice** | Cartão + fechamento de fatura |
| **RecurrenceRule** | Lançamento recorrente (freq, interval, dias de semana, contagem). Gera **Obligations** no worker |
| **Obligation** | Obrigação a vencer. Status: `pending \| due \| overdue \| paid \| canceled \| partial` |
| **Budget** | Orçamento mensal/anual por categoria |
| **Goal** | Meta financeira com valor alvo e data |
| **OutboxEvent + AuditLog + IdempotencyRecord** | Confiabilidade: outbox pattern de eventos, trilha de auditoria por operação, idempotência de requests |

## 9. Observações importantes de arquitetura

### 9.1 pnpm: store/cache/state LOCAIS (fora do Google Drive!)

O arquivo [`.npmrc`](.npmrc) define:
```
store-dir=.pnpm-store
cache-dir=.pnpm-cache
state-dir=.pnpm-state
public-hoist-exclude[]=@prisma/*
public-hoist-exclude[]=prisma
node-linker=hoisted
```
**NUNCA** aponte esses paths para `G:\Meu Drive\...` — Google Drive bloqueia arquivos do pnpm durante operação e corrompe `node_modules` (cria pastas `*_tmp_*` duplicadas).

### 9.2 Prisma + hoisting no monorepo

Prisma 5 tem um entrypoint `.d.ts` que faz `export * from '.prisma/client/*'` **relativo à própria pasta do pacote**. Com `node-linker=hoisted`, esse caminho só resolve se `@prisma/client` tiver sua própria cópia **local** em `apps/*/node_modules/`. Por isso:
- `public-hoist-exclude` exclui `@prisma/*` do hoisting para apps locais.
- `apps/api/prisma/schema.prisma` `generator client { output = "../node_modules/@prisma/client/.prisma/client" }` gera o cliente **DENTRO** da cópia local.
- O mesmo vale para `apps/worker/node_modules/@prisma/client`.

Não remova as cópias locais do Prisma em `apps/api/node_modules/@prisma` e `apps/worker/node_modules/@prisma`.

### 9.3 Typecheck 100%

`pnpm typecheck` passa em **8/8 packages** no estado atual do scaffold. Se introduzir novo erro, consulte primeiro os tsconfigs base em `packages/config/`.

## 10. Documentação detalhada

A pasta [`doc/`](doc/) contém documentos de visão completa:
1. [Visão do produto](doc/01-visao-do-produto.md)
2. [Arquitetura proposta](doc/02-arquitetura.md)
3. [Tecnologias](doc/03-tecnologias.md)
4. [Funcionalidades](doc/04-funcionalidades.md)
5. [Modelo de domínio e dados](doc/05-modelo-de-dominio.md)
6. [Segurança e NFR](doc/06-requisitos-nao-funcionais.md)
7. [Roadmap](doc/07-roadmap.md)
8. [Aplicativo desktop](doc/08-aplicativo-desktop.md)

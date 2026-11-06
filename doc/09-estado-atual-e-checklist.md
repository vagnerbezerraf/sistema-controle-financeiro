# Estado atual da implementação · checklist e próximos passos

> Status global: **Fase 0 do roadmap (Fundação e scaffold) concluída** — scaffold completo, incluindo o build real do desktop (Tauri 2 + Rust) com a janela nativa validada e instaladores MSI/NSIS gerados.
> Última atualização: 6 de novembro de 2026
> Referência: [doc/07-roadmap.md](./07-roadmap.md), [doc/11-adr-oidc-pkce.md](./11-adr-oidc-pkce.md), [README.md raiz](../README.md)

## 1. Mapão de status por fase do roadmap

| Fase | Objetivo (resumido) | % concluído | Observação |
|---|---|---|---|
| **FASE 0 · Fundação e scaffold** | Estrutura, autenticação, criar espaço, CI/CD, homologação | **100%** | Fluxo completo (cadastro → login → criar espaço → dashboard) validado de ponta a ponta na API e no web; lint, CI, Pino + OpenTelemetry, threat model, OIDC/PKCE (Keycloak), MFA (TOTP) + recuperação de senha, homologação (Dockerfiles + `docker-compose.staging.yml` + job de build das imagens no CI) e **build real do desktop (Tauri 2 + Rust)** com janela nativa e instaladores MSI/NSIS validados. |
| FASE 1 · Núcleo financeiro (presente confiável) | Contas, lançamentos, transferências, estornos, saldos, dashboard | ~40% | API de contas, categorias e transações (com idempotência e dashboard) já existe. Faltam estornos formalizados, concorrência otimista, exportação e testes E2E. |
| FASE 2 · Compromissos e crédito | Cartões, parcelas, recorrências, calendário, alertas, worker | ~10% | Models `CreditCard`, `Invoice`, `RecurrenceRule`, `Obligation` existem. Worker tem só stub; nenhuma regra de negócio implementada. |
| FASE 3 · Planejamento | Orçamentos, metas, saldo projetado, cenários | ~10% | Models `Budget`, `Goal` existem. Nenhum cálculo implementado. |
| FASE 4 · Portabilidade e colaboração | CSV/OFX, conciliação, espaços familiares, comprovantes | ~10% | `Membership` funcional (listar/convidar). Falta importação CSV/OFX, conciliação e comprovantes em S3. |
| FASE 5 · Integrações e escala | Open Finance, offline completo, multi-moeda, microserviços | 0% | Nada implementado. |

---

## 2. O que JÁ ESTÁ implementado (verificado no código)

### 2.1 Fundação

- ✅ **Monorepo pnpm workspaces + Turborepo 2**: 5 apps + 4 packages, `pnpm-workspace.yaml`, cache turbo e tasks `typecheck`, `lint`, `build`, `db:generate` em [`turbo.json`](../turbo.json).
- ✅ **Ambiente local**: PostgreSQL 17 + Redis 7 + MailHog em [`docker-compose.yml`](../docker-compose.yml) (perfis `optional` e `full`).
- ✅ **Typecheck 100%**: `pnpm typecheck` = **8/8 packages successful**.
- ✅ **Pacotes compartilhados**:
  - `@scf/validation` — `MoneyAmount` (4 casas decimais, string), `IsoDate`, `CurrencyCode`, etc.
  - `@scf/api-contracts` — `DashboardSummary`, `AuthResponse`, `UserProfile`, `FinancialSpace`, DTOs.
  - `@scf/design-tokens` — paleta, espaçamentos, tipografia, sombras, breakpoints.
  - `@scf/config` — `tsconfig.*.json` base (base/node/react/nextjs), ESLint 9 flat e Prettier.
- ✅ **Lint 100%**: `eslint.config.mjs` flat nas 5 apps herdando `@scf/config`. `pnpm lint` = **5/5 successful**, 0 erros (apenas warnings de `no-explicit-any`, `react-hooks/exhaustive-deps`, `react-refresh/only-export-components`).
- ✅ **Pipeline CI**: [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) — `pnpm install --frozen-lockfile` → `db:generate` → `typecheck` → `lint` → `test:unit` em push/PR para `main`. Sequência validada localmente (typecheck 8/8, lint 5/5, test:unit 5/5).
- ✅ **Observabilidade**: Pino estruturado (`nestjs-pino` + `pino-http`) com redação de credenciais e `correlation_id` reaproveitando `req.id`; OpenTelemetry SDK (traces + métricas via OTLP HTTP) inicializado em [`otel.ts`](../apps/api/src/telemetry/otel.ts) antes do bootstrap, com flush no shutdown. Desabilitado por padrão (`OTEL_ENABLED=false`).

### 2.2 Banco de dados e migrações

- ✅ **Schema Prisma completo**: 16 models + 11 enums com relações bidirecionais e constrains, em [`apps/api/prisma/schema.prisma`](../apps/api/prisma/schema.prisma).
- ✅ **Migration REAL materializada**: [`migration.sql`](../apps/api/prisma/migrations/20260821000000_init_schema/migration.sql) com **16 `CREATE TABLE`** e os 11 enums (extensões `uuid-ossp`, `pgcrypto`, `citext`).
- ✅ **Seed funcional**: [`seed.ts`](../apps/api/prisma/seed.ts) cria usuário demo (`demo@scf.local`), espaço financeiro com membership `owner`, 10 categorias padrão e 3 contas.

### 2.3 Autenticação (JWT local + OIDC/PKCE + MFA — funcional)

- ✅ **Domínio de auth real**: [`auth.domain.service.ts`](../apps/api/src/identity/domain/auth.domain.service.ts) com `bcrypt` (cost 12), `register`, `authenticateLocal`, `issueTokens` (com `spaceIds`/`memberships` no payload) e `refresh`.
- ✅ **Endpoints locais**: `POST /identity/register`, `POST /identity/login` (com segundo fator quando o MFA está ativo), `POST /identity/refresh`, `GET /identity/me` em [`identity.controller.ts`](../apps/api/src/identity/http/identity.controller.ts).
- ✅ **Register cria espaço padrão** automaticamente com membership `owner`.
- ✅ **Guards e decorators**: `JwtAuthGuard`, `SpaceRoleGuard`, `@Roles()`, `@CurrentUser()`, `@Public()` em [`auth.guard.ts`](../apps/api/src/common/auth/auth.guard.ts).

### 2.4 API de domínio (endpoints reais)

- ✅ **Financial spaces**: listar, criar, detalhar, atualizar, listar membros e convidar membro em [`financial-spaces.controller.ts`](../apps/api/src/financial-spaces/financial-spaces.controller.ts).
- ✅ **Transactions**: listar (paginação por cursor + filtros), criar (com `Idempotency-Key` e validação de postings débito/crédito), detalhar, cancelar (soft delete via status) e `GET /summary/dashboard` em [`transactions.controller.ts`](../apps/api/src/transactions/transactions.controller.ts).
- ✅ **Accounts** e **Categories** com controllers, modules e DTOs.
- ✅ **Health** (`GET /health` com checagem de banco) + **CorrelationIdMiddleware** (`X-Correlation-Id`).
- ✅ **Idempotência, auditoria, outbox**: models `IdempotencyRecord`, `AuditLog`, `OutboxEvent` no schema (idempotência já usada em transactions).

### 2.5 Aplicações cliente

- ✅ **Web (Next.js 15 App Router)** — fluxo real, sem placeholders:
  - [`login/page.tsx`](../apps/web/src/app/login/page.tsx) e [`register/page.tsx`](../apps/web/src/app/register/page.tsx) com React Hook Form + Zod.
  - [`AuthContext.tsx`](../apps/web/src/components/auth/AuthContext.tsx) com bootstrap, refresh automático de token e tratamento de 401.
  - [`api-client.ts`](../apps/web/src/lib/api-client.ts) com `apiFetch`, `setAuth`, `clearAuth`.
  - [`dashboard/page.tsx`](../apps/web/src/app/app/dashboard/page.tsx) consumindo dashboard, contas e lançamentos via React Query.
  - Demais páginas (`accounts`, `categories`, `transactions`, `budgets`, `goals`, `cards`, `calendar`, `reports`, `settings`) ainda usam `_sections/placeholder.tsx`.
- ✅ **Mobile (Expo 52)** — Expo Router com grupos `(public)`/`(private)`, NativeWind e `expo-secure-store` declarado.
- ✅ **Desktop (Tauri 2 + React)** — estrutura, `src-tauri` (Rust) e permissões de HTTP para `localhost:3001`.
- ✅ **Worker (BullMQ)** — estrutura com Pino, apenas stub de jobs.
- ✅ **Fluxo E2E validado** — `register → login → criar espaço → criar conta → criar transação → dashboard` executado com dados reais (despesa 150, saldo realizado 850). No web, `pnpm dev:web` compila sem erros e `/`, `/login`, `/register` e as rotas `/app/*` respondem **200**; a API libera CORS para `http://localhost:3000`.

### 2.6 Identidade federada (OIDC/PKCE), MFA e recuperação de senha

- ✅ **OIDC Authorization Code + PKCE (S256)** — clientes públicos fazem o redirect ao provedor e entregam o `code` à API, que troca por token e emite os JWTs próprios do SCF, preservando toda a autorização existente. Implementado em [`oidc.service.ts`](../apps/api/src/identity/domain/oidc.service.ts).
- ✅ **Endpoints OIDC**: `GET /identity/oidc/config?client=web|mobile|desktop` (metadados para o redirect) e `POST /identity/oidc/exchange` (troca `code` + `code_verifier` por tokens do SCF). O primeiro login externo vincula a conta local existente (pelo e-mail) ou cria uma nova com espaço padrão (`findOrCreateOidcUser`).
- ✅ **Distinção issuer público × interno**: o navegador usa `http://localhost:8080/realms/scf`; a API (container) alcança `http://keycloak:8080/realms/scf` via `OIDC_INTERNAL_ISSUER_URL`. O discovery é buscado pela URL interna e reescrito para a pública (`toPublic()`) antes de voltar ao cliente.
- ✅ **MFA (TOTP)** — `POST /identity/mfa/setup` (segredo + otpauth), `POST /identity/mfa/enable` (confirma código, retorna códigos de recuperação), `POST /identity/mfa/disable` (exige código válido). No login, `mfaRequired: true` força o segundo fator. Em [`mfa.service.ts`](../apps/api/src/identity/domain/mfa.service.ts).
- ✅ **Recuperação de senha** — `POST /identity/password/forgot` (202, envia e-mail com token) e `POST /identity/password/reset`. Em [`password-reset.service.ts`](../apps/api/src/identity/domain/password-reset.service.ts). Nova migração [`20261106000000_add_mfa_and_password_reset`](../apps/api/prisma/migrations/20261106000000_add_mfa_and_password_reset/migration.sql) adiciona `mfaEnabled`, `mfaSecret`, `oidcSub` e a tabela de tokens de reset.
- ✅ **Web**: `/login` (MFA condicional + botão SSO), `/forgot-password`, `/reset-password`, `/auth/callback` (troca PKCE) e a configuração de MFA em `/app/settings`. libs [`oidc.ts`](../apps/web/src/lib/oidc.ts) e [`pkce.ts`](../apps/web/src/lib/pkce.ts).
- ✅ **Mobile (Expo)**: telas `(public)/login` (MFA), `(public)/forgot-password`, `(public)/reset-password` e SSO via [`src/lib/oidc.ts`](../apps/mobile/src/lib/oidc.ts) + [`src/lib/pkce.ts`](../apps/mobile/src/lib/pkce.ts).
- ✅ **Provedor de identidade em Docker**: Keycloak 26 (`quay.io/keycloak/keycloak:26.0`, `start-dev --import-realm`) com o realm versionado em [`infra/containers/keycloak/realm-scf.json`](../infra/containers/keycloak/realm-scf.json). Decisão registrada em [doc/11-adr-oidc-pkce.md](./11-adr-oidc-pkce.md).

### 2.7 Homologação (staging) e imagens Docker

- ✅ **Dockerfiles multi-stage**: [`apps/api/Dockerfile`](../apps/api/Dockerfile) e [`apps/web/Dockerfile`](../apps/web/Dockerfile) construídos e executados localmente.
- ✅ **Stack de staging completa**: [`docker-compose.staging.yml`](../docker-compose.staging.yml) sobe postgres + redis + keycloak + job `migrate` + api + web, com healthchecks e rede própria. Validado E2E (`up --build` → migrações → API → `/health` = ok → `/login` = 200 → seed).
- ✅ **CI com build de imagens**: job `docker-build` em [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) usa Buildx + cache do GitHub Actions para construir as imagens da API e do Web.

---

## 3. O que AINDA FALTA na Fase 0

| Prioridade | Item | Motivo |
|---|---|---|
| ✅ | **ESLint 9 flat config nas 5 apps** | Concluído — `turbo run lint` = 5/5 successful, 0 erros. |
| ✅ | **Pipeline CI/CD** | Concluído — `.github/workflows/ci.yml` (install → generate → typecheck → lint → test:unit) + job `docker-build` das imagens. |
| ✅ | **OpenTelemetry + Pino na API** | Concluído — logger estruturado com redaction + correlação; traces/métricas OTLP desabilitados por padrão. |
| ✅ | **Threat model + classificação de dados / LGPD** | Concluído — ver [`10-threat-model-e-lgpd.md`](./10-threat-model-e-lgpd.md). |
| ✅ | **Fluxo E2E ponta a ponta** | Concluído — migration + seed + API + web validados; cadastro → login → espaço → conta → transação → dashboard retornando dados corretos. |
| ✅ | **Homologação (staging)** | Concluído — Dockerfiles (api/web) + [`docker-compose.staging.yml`](../docker-compose.staging.yml) (postgres/redis/keycloak/migrate/api/web) validados E2E; job de build das imagens no CI. |
| ✅ | **OIDC/PKCE (provedor externo)** | Concluído — Authorization Code + PKCE (S256) com Keycloak 26 em Docker; endpoints `/identity/oidc/config` e `/identity/oidc/exchange`; decisão em [doc/11-adr-oidc-pkce.md](./11-adr-oidc-pkce.md). |
| ✅ | **MFA e recuperação de senha** | Concluído — MFA (TOTP) com setup/enable/disable e códigos de recuperação; fluxo `password/forgot` + `password/reset` no web e mobile. |
| ✅ | **Build real do desktop (Tauri 2 + Rust)** | Concluído — toolchain Rust (rustup/stable, MSVC x64), `tauri build` gera `scf-desktop.exe` e instaladores **MSI** (`SCF_0.1.0_x64_pt-BR.msi`) e **NSIS** (`SCF_0.1.0_x64-setup.exe`); janela nativa (WebView2) validada sem crash. Plugin `updater` removido do scaffold (sem canal de releases/chave) para não abortar na inicialização. |
| ⚪ 2 | **Validação das 9 perguntas de produto** | Em aberto em [`doc/README.md`](./README.md#L50-L62). Não bloqueia código. |

---

## 4. Lições aprendidas HARD (não repetir!)

> Essas dores custaram **horas** para diagnosticar. **Não apague seletivamente**. Mantenha este documento.

### 4.1 Google Drive / nuvem sincronizada CORROMPE o pnpm / node_modules

**Sintoma**: `pnpm install` trava sem fim, ou termina com pastas `*_tmp_*` resquícios em `node_modules/@types/` ou `node_modules/@scf/` que quebram typecheck com `TS2688 Cannot find type definition for node_tmp_XXXXXX`.

**Causa raiz**: O `.npmrc` original apontava `store-dir`, `cache-dir`, `state-dir` para `G:\Meu Drive\proj\...`. O Google Drive tranca arquivos durante a sincronização no meio de operações atômicas do pnpm.

**Correção aplicada e NÃO REVERTER**:
- `.npmrc` usa **paths relativos LOCAIS** ao projeto: `store-dir=.pnpm-store`, `cache-dir=.pnpm-cache`, `state-dir=.pnpm-state`.
- Regra fixa: o projeto SCF **nunca deve viver em pastas sincronizadas por nuvens** (Google Drive, OneDrive, Dropbox). Caminhos locais (`C:\proj`, `~/proj`) apenas. Ver [README raiz § 9.1](../README.md#L151-L164).

### 4.2 pnpm-workspace.yaml sumindo (renomeado para .bak)

**Sintoma**: `pnpm install` não reconhece workspaces, instala tudo 5 vezes (por app), e o Turborepo não encontra tasks.

**Causa raiz**: arquivo foi renomeado `pnpm-workspace.yaml.bak` em alguma cópia anterior.

**Ação imediata**: renomear de volta para `pnpm-workspace.yaml` com `packages: [apps/*, packages/*]`.

### 4.3 Prisma 5 + `node-linker=hoisted` (pnpm) quebra resolução de tipos

**Sintoma**: +60 erros `TS2305: Module '@prisma/client' has no exported member User / CurrencyCode / etc.`

**Causa raiz**: o entrypoint do `@prisma/client/default.d.ts` faz `export * from '.prisma/client/default'`, caminho **RELATIVO À PASTA DO PACOTE**. Com hoisting, o pacote fica na raiz sem a subpasta `.prisma/client/`, e o TypeScript não acha os exports.

**Correção aplicada (3 pilares — NÃO MEXA)**:
1. `.npmrc` com `public-hoist-exclude[]=@prisma/*` e `public-hoist-exclude[]=prisma`.
2. **Cópia LOCAL** de `@prisma/client` e `prisma` em `apps/api/node_modules/` e `apps/worker/node_modules/`.
3. **Generator output custom**: `output = "../node_modules/@prisma/client/.prisma/client"` no schema.

### 4.4 Não deixe `.prisma/client` DUPLICADO solto em `apps/*/node_modules/.prisma/`

Havia uma pasta `.prisma` duplicada de **20.72 MB** em `apps/api/node_modules/.prisma/` (ociosa). Já removida. Após `prisma generate`, confirme que o output cai **apenas** em `apps/api/node_modules/@prisma/client/.prisma/client/`.

### 4.5 tsconfig paths só aceitam 1 wildcard (TS5062)

`TS5062: Substitution pattern can have at most one '*' character.` — paths com dois wildcards (ex: `src/*/domain/*`) são ilegais. Padrão correto em [`apps/api/tsconfig.json`](../apps/api/tsconfig.json): `@domain/* → src/domain/*`, `@app/* → src/application/*`, `@infra/* → src/infrastructure/*`.

### 4.6 Prisma schema: relações bidirecionais são OBRIGATÓRIAS

Erros `P1012` são sempre: relação inversa ausente em 1:N, ou `@unique` ausente na FK de relação one-to-one. Rode `pnpm db:validate` antes de migrar.

### 4.7 Limpeza segura de caches/artifacts

`pnpm clean` apaga dist, `.turbo`, build, tsbuildinfo, `.expo` — mas **não apaga `node_modules`** (economiza minutos de reinstall).

### 4.8 Tailwind: ao SUBSTITUIR uma escala do tema, complete os valores usados

**Sintoma**: o Next compila as páginas mas devolve **500** com `Syntax error: The 'px-2.5' class does not exist` (ou `text-white`, `transition-normal`).

**Causa raiz**: o [`tailwind.config.ts`](../apps/web/tailwind.config.ts) faz `colors: color` e `spacing: { ...spacing }`, o que **substitui** (não estende) as escalas padrão do Tailwind. Qualquer valor ausente no design-token falha no `@apply` e não é gerado nas `className`.

**Correção aplicada** em [`packages/design-tokens/src/index.ts`](../packages/design-tokens/src/index.ts):
- `color`: adicionado `white: '#ffffff'` (para `bg-white`/`text-white`).
- `spacing`: adicionados os passos fracionários `0.5/1.5/2.5` e os deslocados `9/64` (para `px-2.5`, `py-0.5`, `gap-1.5`, `h-9`, `w-64`).
- **`transition-normal` / `transition-fast` não existem**: o tema define `transitionDuration.fast/normal/slow`, então o correto é `transition duration-normal` (o `transition` provê a propriedade; o `duration-*` a duração).

**Regra**: antes de customizar uma escala, rode `rg '\b(px|py|p|gap|h|w|m|text|bg)-...'` e garanta que todo valor usado existe no token.

### 4.9 Prisma `@db.Date`: sempre `Date`, nunca string `YYYY-MM-DD`

**Sintoma**: `PrismaClientValidationError` (`premature end of input`) em campos `@db.Date` (`initialBalanceDate`, `effectiveDate`, `dueDate`).

**Correção**: usar o helper [`toDate()`](../apps/api/src/common/utils/date.ts) nos controllers antes de enviar ao Prisma (DTS aceitam string `YYYY-MM-DD`, o banco não).

### 4.10 Docker + `node-linker=hoisted`: o stub de `.prisma/client` na raiz sombreia o client real

**Sintoma**: `docker build` da API falha com **~35 erros** `TS2305: Module '@prisma/client' has no exported member 'Account'/'AccountType'/...` + vários `TS7006` (implicit any) — embora `pnpm typecheck` local saia **0**.

**Causa raiz**: com `node-linker=hoisted`, o pacote `@prisma/client` é elevado para a **raiz** `node_modules`. Seu `postinstall` roda no estágio `deps` (ainda **sem** o schema Prisma), criando um **stub** em `node_modules/.prisma/client` (raiz). O client REAL é gerado em `apps/node_modules/.prisma/client` (via o `output` custom do generator), mas o stub da raiz **vence a resolução**.

**Correção aplicada (NÃO REVERTER)** — no estágio `build` de [`apps/api/Dockerfile`](../apps/api/Dockerfile), logo após `db:generate`:
```dockerfile
RUN pnpm --filter @scf/api db:generate \
 && rm -rf node_modules/.prisma \
 && cp -a apps/node_modules/.prisma node_modules/.prisma \
 && pnpm --filter @scf/api build
```
Validar com `node -e "require('@prisma/client')"` dentro da imagem → `PrismaClient function | AccountType object | TransactionType object`.

**Sintoma relacionado** (base image): no `pnpm install` aparecem avisos `failed to detect the libssl/openssl version`. **Correção**: instalar `openssl ca-certificates` no estágio base antes de habilitar o Corepack.

### 4.11 Runner Docker: binários hoisted ficam na RAIZ `node_modules/.bin` (e faltam arquivos de workspace)

**Sintoma 1**: ao rodar as migrações, `Command "prisma" not found` — o `.bin/prisma` está em `/app/node_modules/.bin` (raiz), não em `apps/api/node_modules/.bin`.

**Sintoma 2**: no web, `next: not found` / `spawn ENOENT` o container reinicia.

**Sintoma 3**: `pnpm run db:seed` falha com `TS5083: Cannot read file '/app/tsconfig.base.json'` (o `ts-node` do seed referencia o tsconfig base do repo).

**Correções aplicadas (NÃO REVERTER)**:
1. No runner de ambos os Dockerfiles: `ENV PATH=/app/node_modules/.bin:$PATH`.
2. No runner do web: `WORKDIR /app/apps/web` + `CMD ["pnpm", "run", "start"]`; **não** copiar `apps/node_modules` (essa pasta só é criada no build da API, via `db:generate`).
3. No runner da API: `COPY --from=build /app/tsconfig.base.json ./tsconfig.base.json`.
4. No `docker-compose.staging.yml`, o job `migrate` usa `['pnpm', 'run', 'db:migrate:deploy']` (o runner não tem os arquivos de workspace, logo `pnpm --filter @scf/api ...` não resolve).

### 4.12 Next.js 15: `useSearchParams()` exige boundary de `<Suspense>`

**Sintoma**: `docker build` do web falha com `useSearchParams() should be wrapped in a suspense boundary at page "/login"` (erro de prerender).

**Correção**: envolver cada página que usa `useSearchParams()` num `<Suspense fallback={...}>` (o conteúdo vai para um componente interno). Aplicado em `/login`, `/forgot-password`, `/reset-password` e `/auth/callback`.

### 4.13 Tauri 2 no Windows: versões, capabilities e empacotamento

**Sintomas e correções:**
- **`LNK1104: cannot open file 'msvcrt.lib'`** — o rustc escolheu um VS sem ambiente de dev. Carregar o VS 2022 antes de compilar: `Import-Module "...\2022\Community\Common7\Tools\Microsoft.VisualStudio.DevShell.dll"; Enter-VsDevShell -VsInstallPath "..." -DevCmdArguments '-arch=x64 -host_arch=x64'`.
- **`Found version mismatched Tauri packages`** — o CLI compara o *minor* dos crates Rust com os pacotes npm `@tauri-apps/*`. Fixar com til (`~`), não caret: `tauri = "~2.12"`, `tauri-plugin-* = "~X.Y"`, e manter os pacotes npm no mesmo minor.
- **`tauri X` não compila contra `tauri-runtime Y`** — o minor do crate `tauri` deve ser **≥** o das dep transitivas `tauri-runtime`/`tauri-runtime-wry` (ex.: `tauri 2.11` + `tauri-runtime 2.12` quebra). Preferir sempre a linha mais recente e alinhar os npm junto.
- **Permissões inexistentes em `capabilities/default.json`** abortam o build (`Permission fs:allow-create-dir not found`). Nomes válidos incluem `fs:allow-mkdir` e `fs:allow-remove`; identificadores tipo `updater:*` só existem se o plugin correspondente estiver registrado.
- **Crash `0xC0000409` na inicialização** com `PluginInitialization("updater", ... expected struct Config)` — o plugin `updater` exige um bloco `plugins.updater` (com `pubkey`/`endpoints`) no `tauri.conf.json`. Sem canal de releases/chave, **removemos o plugin** (Cargo, `main.rs`, capabilities e `package.json`) em vez de commitar chave falsa.
- **`Acesso negado ... AppData\Local\tauri`** ao empacotar — solução documentada: `bundle.useLocalToolsDir: true` cacheia WiX/NSIS em `target/.tauri/` (indispensável quando o AppData é restrito, ex.: sandbox/CI).
- **`os error 2` no passo MSI** — `bundle.windows.wix.template` espera o **caminho de um arquivo `.wxs`**, não um nome de UI. Remover a chave usa o template padrão.
- **`Can't open language file ... PortugueseBrazil.nlf`** — o idioma do NSIS é `PortugueseBR` (não `PortugueseBrazil`).
- **Build limpo**: `pnpm --filter @scf/desktop tauri build` gera `scf-desktop.exe` + `SCF_0.1.0_x64_pt-BR.msi` + `SCF_0.1.0_x64-setup.exe` em `src-tauri/target/release/bundle/`.

---

## 5. Comandos de sanidade (rodar antes de começar qualquer dia)

```bash
pnpm install            # Garante dependências
pnpm typecheck          # 8/8 successful = ok
pnpm lint               # ---
pnpm test:unit          # Vitest (poucos testes por enquanto)

# Se mudar o schema Prisma:
pnpm db:validate        # Valida schema (rápido)
pnpm db:generate        # Re-gera o Prisma Client LOCAL em apps/api e apps/worker

# Se mudar .npmrc / pnpm-workspace.yaml: pnpm install de novo
```

### 5.1 Stack de homologação (staging)

```bash
# Sobe tudo (postgres + redis + keycloak + migrate + api + web) com build das imagens:
docker compose -f docker-compose.staging.yml up -d --build

# Sanidade:
curl http://localhost:3001/health                       # {"status":"ok",...}
curl http://localhost:3000/login -o /dev/null -w "%{http_code}\n"   # 200
curl "http://localhost:3001/api/v1/identity/oidc/config?client=web" # { enabled, authorizationEndpoint, ... }
# Keycloak (realm scf): http://localhost:8080  (admin/admin por padrão)

# Seed (opcional):
docker exec scf-staging-api pnpm run db:seed

# Derruba e apaga volumes:
docker compose -f docker-compose.staging.yml down -v
```

> As credenciais do compose são apenas defaults de desenvolvimento; em ambientes reais use variáveis de ambiente / secrets do orquestrador.

---

## 6. Próximos passos para fechar a Fase 0

**Definição de FEITO Fase 0**: rodar `pnpm install` → `docker compose up -d postgres` → `pnpm db:migrate` → `pnpm --filter @scf/api db:seed` → `pnpm dev:api` → `pnpm dev:web` → na UI web: cadastrar usuário → logar → criar espaço → ver dashboard. Depois repetir o fluxo em build de dev do desktop.

Ordem recomendada (todos concluídos):

1. ✅ **Lint 100%** — `eslint.config.mjs` flat em cada app herdando `@scf/config`, com `turbo run lint` saindo 0.
2. ✅ **CI/CD mínimo** — `.github/workflows/ci.yml` com `pnpm install --frozen-lockfile` → `typecheck` → `lint` → `test:unit` em push para `main` e PRs.
3. ✅ **Observabilidade** — Pino logger estruturado na API + OpenTelemetry SDK.
4. ✅ **Threat model e LGPD** — documento de governança em [`10-threat-model-e-lgpd.md`](./10-threat-model-e-lgpd.md).
5. ✅ **Validar fluxo E2E** — Docker, migração, seed, API e web validados de ponta a ponta (cadastro → login → criar espaço → criar conta → criar transação → dashboard) com dados reais.
6. ✅ **OIDC/PKCE** — Authorization Code + PKCE (S256) com Keycloak 26 em Docker; endpoints de config/exchange, telas no web e mobile e decisão em [doc/11-adr-oidc-pkce.md](./11-adr-oidc-pkce.md).
7. ✅ **MFA (TOTP) e recuperação de senha** — backend + telas web e mobile (setup/enable/disable, códigos de recuperação, fluxo esqueci/redefinir senha).
8. ✅ **Homologação (staging)** — Dockerfiles + [`docker-compose.staging.yml`](../docker-compose.staging.yml) + job de build das imagens no CI.
9. ✅ **Build Tauri real** — `tauri build` com a toolchain Rust + WebView2 gerando `scf-desktop.exe` e instaladores MSI/NSIS; janela nativa validada sem crash.

**Fase 0 fechada.** Próximo: início da Fase 1 (estornos, concorrência otimista, exportação e testes E2E).

# Estado atual da implementação · checklist e próximos passos

> Status global: **Fase 0 do roadmap (Fundação e scaffold) concluída** — scaffold completo, incluindo o build real do desktop (Tauri 2 + Rust) com a janela nativa validada e instaladores MSI/NSIS gerados.
> Última atualização: 18 de novembro de 2026
> Referência: [doc/07-roadmap.md](./07-roadmap.md), [doc/11-adr-oidc-pkce.md](./11-adr-oidc-pkce.md), [README.md raiz](../README.md)

## 1. Mapão de status por fase do roadmap

| Fase | Objetivo (resumido) | % concluído | Observação |
|---|---|---|---|
| **FASE 0 · Fundação e scaffold** | Estrutura, autenticação, criar espaço, CI/CD, homologação | **100%** | Fluxo completo (cadastro → login → criar espaço → dashboard) validado de ponta a ponta na API e no web; lint, CI, Pino + OpenTelemetry, threat model, OIDC/PKCE (Keycloak), MFA (TOTP) + recuperação de senha, homologação (Dockerfiles + `docker-compose.staging.yml` + job de build das imagens no CI) e **build real do desktop (Tauri 2 + Rust)** com janela nativa e instaladores MSI/NSIS validados. |
| FASE 1 · Núcleo financeiro (presente confiável) | Contas, lançamentos, transferências, estornos, saldos, dashboard | ~58% | API de contas, categorias e transações (com idempotência e dashboard) coberta por **35 testes E2E da API** (§2.8), **7 testes E2E da Web** (§2.9), **5 fluxos E2E do Mobile** (§2.10) e **6 testes E2E do Desktop** (§2.11). Faltam estornos formalizados, concorrência otimista e exportação. |
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

### 2.8 Testes automatizados (E2E da API)

- ✅ **E2E da API** — Vitest 2 + Supertest com `@nestjs/testing`, rodando contra **PostgreSQL real** (banco dedicado `scf_test`, criado e migrado automaticamente). Specs em [`apps/api/test/e2e`](../apps/api/test/e2e): identidade (cadastro, normalização de e-mail, duplicidade, login, refresh, `/identity/me`, ciclo completo de MFA TOTP + código de recuperação, reset de senha), espaços financeiros e membros (criar/detalhar/atualizar, isolamento entre usuários, convite, bloqueio por papel), contas (saldo inicial gera ajuste; list/detail/patch; 404/403/400) e transações (criação, `INVALID_POSTINGS`/`INVALID_TRANSFER_POSTINGS`, transferência, **idempotência** por `Idempotency-Key`, listagem com filtros e cursor, detalhe + cancelamento lógico, **dashboard** do mês e isolamento entre espaços). **35 testes, todos verdes.**
- ✅ **Infra de teste isolada** — [`vitest.config.e2e.ts`](../apps/api/vitest.config.e2e.ts) transforma via `unplugin-swc` (com `emitDecoratorMetadata`, exigido pela injeção de dependência do Nest), e [`test/e2e`](../apps/api/test/e2e) traz `.env.test`, `globalSetup` (cria o banco + `prisma migrate deploy`), `setupFiles` e helpers (app de teste, reset de banco, factories). A `DATABASE_URL` de teste é validada para conter `scf_test` — proteção contra truncar o banco de desenvolvimento.

### 2.9 Testes automatizados (E2E da Web)

- ✅ **E2E da Web** — Playwright 1.65 rodando o **Next.js real contra a API real** (o `webServer` da config sobe `@scf/api` e `@scf/web` automaticamente). Specs em [`apps/web/e2e`](../apps/web/e2e): **[`auth.e2e.spec.ts`](../apps/web/e2e/auth.e2e.spec.ts)** cobre cadastro pela UI (`/register` → `/app/dashboard`), login válido, credenciais inválidas (erro + permanece em `/login`) e logout (volta para `/login`); **[`app.e2e.spec.ts`](../apps/web/e2e/app.e2e.spec.ts)** cobre o dashboard com dados reais (totais de receitas/despesas/saldo do mês) e a listagem de lançamentos. **7 testes, todos verdes (~44s).**
- ✅ **Isolamento por teste** — cada teste cria o seu próprio usuário via API ([`e2e/utils/api.ts`](../apps/web/e2e/utils/api.ts)), então os dados ficam isolados dentro do espaço financeiro recém-criado mesmo com o banco de desenvolvimento (`scf`) compartilhado.
- ✅ **Configuração** — [`playwright.config.ts`](../apps/web/playwright.config.ts) com `testDir: ./e2e`, `baseURL` do web, `locale: pt-BR` e `timezoneId: America/Sao_Paulo` (para a competência dos dados bater com a API). A URL da API é passada ao Next pelo env `NEXT_PUBLIC_API_BASE_URL` (origem + prefixo `/api/v1`). Requer o Chromium instalado (`pnpm exec playwright install chromium`).

### 2.10 Testes automatizados (E2E do Mobile)

- ✅ **E2E do Mobile** — **Maestro 2.12** (JVM/`JAVA_HOME` jdk-22) rodando o **app Expo real** no **emulador Android** (`scf_e2e`, `emulator-5554`), servido pelo Metro em `exp://10.0.2.2:8081` e falando com a **API real** (`http://127.0.0.1:3001`). Fluxos em [`apps/mobile/.maestro`](../apps/mobile/.maestro): **01-cadastro** (cadastro pela UI com e-mail único → cai no dashboard vazio), **02-login-invalido** (senha errada → mensagem "Credenciais invalidas" e permanece na tela), **03-login-valido** (conta semeada → dashboard com Receitas/Despesas/Realizado/Projetado), **04-navegacao** (abas Lançamentos/Contas/Dashboard) e **05-logout** (aba Perfil → "Sair da conta" → volta ao login). **5/5 fluxos verdes (~5min52).**
- ✅ **Isolamento e estado** — cada fluxo abre o app via `openLink` (`exp://10.0.2.2:8081`) e usa subfluxos de apoio [`ensure-logged-out.yaml`](../apps/mobile/.maestro/scripts/ensure-logged-out.yaml) / [`ensure-logged-in.yaml`](../apps/mobile/.maestro/scripts/ensure-logged-in.yaml); 01 gera um e-mail único por execução com [`unique-email.js`](../apps/mobile/.maestro/scripts/unique-email.js) (`e2e.mobile.<timestamp>@scf.dev`).
- ✅ **Estabilidade de testID** — a tela de login expõe `toggle-login`/`toggle-register`, `input-nome`/`input-email`/`input-senha` e `btn-submit`; as abas expõem `tab-dashboard`/`tab-lancamentos`/`tab-contas`/`tab-perfil`.
- ✅ **Seed dedicado** — o usuário `e2e.mobile@scf.dev` (senha `SenhaForte!123`) é criado por [`apps/mobile/scripts/e2e-seed.mjs`](../apps/mobile/scripts/e2e-seed.mjs) para os fluxos de login.

### 2.11 Testes automatizados (E2E do Desktop)

- ✅ **E2E do Desktop** — **tauri-driver 2.1.0 + WebdriverIO 9.33** rodando o **binário Tauri real** (`scf-desktop.exe`, build `--debug --no-bundle`, WebView2 157) contra a **API real** (`http://127.0.0.1:3001`). Specs em [`apps/desktop/e2e/specs`](../apps/desktop/e2e/specs): **[`auth.e2e.ts`](../apps/desktop/e2e/specs/auth.e2e.ts)** cobre abrir no login sem sessão salva, senha inválida (erro + permanece no login) e login válido (entra no dashboard); **[`app.e2e.ts`](../apps/desktop/e2e/specs/app.e2e.ts)** cobre a consolidação do dashboard com dados reais (totais `1.000,00`/`250,50`/`749,50`, descrições "Salario E2E"/"Aluguel E2E"), a navegação Lançamentos/Contas/Dashboard e o logout (volta ao login). **6 testes, todos verdes (~21s).**
- ✅ **Isolamento por teste** — cada teste cria o próprio usuário via API ([`e2e/utils/api.ts`](../apps/desktop/e2e/utils/api.ts)) com e-mail único (`desktop.e2e.<ts>.<n>@scf.test`) e semeia lançamentos confirmados no mês corrente, isolando os dados por espaço financeiro. O helper [`e2e/utils/ui.ts`](../apps/desktop/e2e/utils/ui.ts) limpa o `localStorage` do WebView2 e recarrega antes de cada login (o WebView2 persiste o storage entre execuções).
- ✅ **Driver casado com o WebView2** — [`e2e/scripts/setup-drivers.ts`](../apps/desktop/e2e/scripts/setup-drivers.ts) baixa/extrai o `msedgedriver` na versão exata do WebView2 instalado (extração via `System.IO.Compression.ZipFile`, não `Expand-Archive`) e valida `--version` antes de registrar. Em [`e2e/wdio.conf.ts`](../apps/desktop/e2e/wdio.conf.ts), o `onPrepare` garante o driver e reconstrói o app via [`e2e/scripts/build-app.ts`](../apps/desktop/e2e/scripts/build-app.ts) (salvo `E2E_SKIP_BUILD=1`); o `beforeSession` sobe o `tauri-driver --native-driver <msedgedriver>` em `127.0.0.1:4444`.
- ⚠️ **Rebuild obrigatório ao mudar o frontend** — o binário Tauri embute o `dist` do Vite (`beforeBuildCommand` do [`tauri.conf.json`](../apps/desktop/src-tauri/tauri.conf.json)); mudanças em `src/**` só aparecem após reconstruir (o `onPrepare` faz isso por padrão).
- ⚠️ **Precisa rodar fora do sandbox do Trae** — o sandbox injeta DLLs no WebView2 e o Chromium aborta com `FAIL_FAST`; ver §4.16 e o runner em §5.5.

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

### 4.14 NativeWind/`react-native-css-interop`: o aviso de "upgrade" CRASHA o app em dev

**Sintoma**: no Android (Expo Go), ao **interagir** com componentes cujo `className` muda depois do primeiro render (ex.: tocar num toggle que troca `bg-white shadow-sm` por outra classe), aparece um overlay vermelho **"Render Error: Couldn't find a navigation context. Have you wrapped your app with 'NavigationContainer'?"** com Component Stack `<CssInterop.TouchableOpacity />` e Call Stack passando por `react-native-css-interop/dist/runtime/native/render-component.js :: replace`. O app fica coberto pelo LogBox e os testes E2E falham (o elemento esperado nunca fica visível).

**Causa raiz**: quando a classe de um componente re-renderizado introduz variáveis CSS (`--tw-*`), o css-interop marca `SHOULD_UPGRADE` e chama `printUpgradeWarning`, que faz `stringify(originalProps)` (um `JSON.stringify` recursivo). O replacer acessa *getters* dos props; alguns props carregam o contexto do React Navigation, cujo getter `getKey` **lança** `"Couldn't find a navigation context"`. Como isso roda **durante o render**, o throw derruba a árvore e o LogBox mostra "Render Error".
> As classes com cor sólida também introduzem variável (`bg-neutral-100`/`text-neutral-900` → `--tw-bg-opacity`/`--tw-text-opacity`), então "trocar o className por outro utilitário" **não** resolve — o gatilho é a *mudança*, não o utilitário.

**Correção aplicada (NÃO REVERTER)** — patch do pacote via pnpm:
- [`patches/react-native-css-interop@0.1.22.patch`](../patches/react-native-css-interop@0.1.22.patch) envolve `stringify(originalProps)` num `try/catch` (logando `[nao serializavel: ...]`), e o `patchedDependencies` fica registrado no [`package.json`](../package.json) raiz.

### 4.15 Metro do Expo em `CI=true` serve bundle ANTIGO (reloads desabilitados)

**Sintoma**: você edita `apps/mobile/**` ou um arquivo em `node_modules`, mas o app continua rodando o código antigo — os fixes "não surtem efeito" e o diagnóstico vira chute.

**Causa raiz**: com `CI=true` no ambiente, o `expo start` avisa *"Metro is running in CI mode, reloads are disabled"*: não há watch/Fast Refresh e o bundle vem do cache.

**Correção**: rodar o Metro **sem** `CI` (`Remove-Item Env:CI`) e/ou reiniciar com `npx expo start --clear` para descartar o cache de transformação. Neste sandbox, escrever em `%USERPROFILE%\.expo` (cache de módulos nativos) é bloqueado — contorne apontando `USERPROFILE`/`HOME` para uma pasta dentro do projeto antes de subir o Metro.

### 4.16 Sandbox do Trae injeta DLLs no WebView2 e derruba o Chromium (E2E do desktop)

**Sintoma**: o `wdio` falha em `POST /session` com `session not created: DevToolsActivePort file doesn't exist` (timeout ~60s). O `scf-desktop.exe` sobe, mas o processo `msedgewebview2.exe` do app morre imediatamente.

**Diagnóstico (Windows Event Log / WER)**: o log `Application` e o `Report.wer` (`C:\ProgramData\Microsoft\Windows\WER\ReportArchive\AppCrash_msedgewebview2*`) mostram:
```
Nome do aplicativo com falha: msedgewebview2.exe, versão: 157.0.4341.60
Nome do módulo com falha: msedge.dll    Código de exceção: 0x80000003 (STATUS_BREAKPOINT / FAIL_FAST)
```
e, na lista de módulos carregados, as **DLLs do sandbox do Trae**:
```
...\Trae\resources\app\modules\sandbox\x64\aiep_sbox.dll
...\Trae\resources\app\modules\sandbox\x64\aiep_ipc.dll
```

**Causa raiz**: o sandbox do Trae injeta `aiep_sbox.dll`/`aiep_ipc.dll` em processos-filho. O Chromium/WebView2 detecta a injeção de DLL não assinada/não whitelisted e dispara `FAIL_FAST` (0x80000003) — "integridade do processo comprometida".

**Correção**: rodar o build + E2E **fora da árvore de processos do sandbox** (ex.: via Agendador de Tarefas do Windows). Comprovado: dentro do sandbox o `msedgewebview2.exe` não sobrevive; fora dele a sessão é criada e os **6 testes passam**. Ver o runner em §5.5.

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

### 5.1 Testes E2E da API

```bash
# Exigem o Postgres rodando (o globalSetup cria e migra o banco scf_test):
docker compose up -d postgres
pnpm --filter @scf/api test:e2e     # ou: pnpm turbo run test:e2e  → 35 testes verdes
```

### 5.2 Testes E2E da Web

```bash
# 1) Instalar o navegador do Playwright (uma vez):
pnpm --filter @scf/web exec playwright install chromium

# 2) Exige o Postgres rodando (usa o banco de desenvolvimento `scf`):
docker compose up -d postgres

# 3) Roda a suíte. O `webServer` do Playwright sobe a API e o Next automaticamente
#    (em dev) se não estiverem rodando; se já estiverem, eles são reaproveitados:
pnpm --filter @scf/web test:e2e        # → 7 testes verdes (~44s)
pnpm --filter @scf/web test:e2e:ui     # modo interativo (Playwright UI)
```

> Os testes criam o próprio usuário via API a cada execução, então não precisam de reset do banco. Cada teste fica isolado no seu próprio espaço financeiro.

### 5.3 Stack de homologação (staging)

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

### 5.4 Testes E2E do Mobile (Maestro)

```powershell
# Pré-requisitos: Postgres + API (porta 3001) + emulador Android rodando,
# e o Metro do Expo servindo o app.

# 1) Semeia a conta usada nos fluxos de login (idempotente):
cd apps/mobile; pnpm e2e:seed

# 2) Sobe o Metro do app (na raiz do app; mantê-lo aberto durante a suíte):
npx expo start

# 3) Roda a suíte pelo emulador alvo (Maestro no PATH):
maestro --device emulator-5554 test .maestro      # → 5/5 fluxos verdes
```

> Rodar um fluxo isolado: `maestro --device emulator-5554 test .maestro/01-cadastro.yaml`.
> O Metro precisa de **watch mode** (não rode com `CI=true`, que desliga o reload e serve bundles antigos).
> Requer JVM 22 (`JAVA_HOME` apontando para o JDK 22) para o Maestro.

### 5.5 Testes E2E do Desktop (tauri-driver)

```powershell
# Pré-requisitos: Postgres + API (porta 3001) rodando, toolchain Rust (MSVC x64),
# tauri-driver no PATH (~/.cargo/bin) e o WebView2 instalado.

# 1) Baixa/atualiza o msedgedriver casado com o WebView2 (idempotente):
pnpm --filter @scf/desktop e2e:drivers

# 2) Reconstrói o binário de debug (embute o dist do Vite):
pnpm --filter @scf/desktop e2e:build

# 3) Roda a suíte (o onPrepare já garante driver + build):
pnpm --filter @scf/desktop test:e2e   # -> 6 testes verdes (~21s)
```

> **Importante**: o WebView2 aborta se o processo sofrer injeção de DLL do sandbox do Trae (§4.16). Rode os comandos acima em um terminal **fora do sandbox** (ex.: agendando via Agendador de Tarefas do Windows). Se o build já estiver atualizado, defina `$env:E2E_SKIP_BUILD = '1'` para pular o rebuild do passo 3.

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

**Fase 0 fechada.** Próximo: continuação da Fase 1 — **testes E2E da API (35 verdes)**, **da Web (7 verdes, Playwright)**, **do Mobile (5 fluxos verdes, Maestro)** e **do Desktop (6 verdes, tauri-driver/WebdriverIO)** concluídos; seguem os itens de produto restantes (estornos formalizados, concorrência otimista, exportação).

# Estado atual da implementação · checklist e próximos passos

> Status global: **Fase 0 do roadmap (Fundação e scaffold) em ~80% concluída**  
> Última atualização: 30 de setembro de 2026  
> Referência: [doc/07-roadmap.md](./07-roadmap.md), [README.md raiz](../README.md)

## 1. Mapão de status por fase do roadmap

| Fase | Objetivo (resumido) | % concluído | Observação |
|---|---|---|---|
| **FASE 0 · Fundação e scaffold** | Estrutura, autenticação, criar espaço, CI/CD, homologação | **~80%** | Fundação técnica e domínio estão sólidos. Falta conectar fluxo visual real (telas ↔ controllers), OIDC/PKCE, migration materializada, lint 100% e CI. |
| FASE 1 · Núcleo financeiro (presente confiável) | Contas, lançamentos, transferências, estornos, saldos, dashboard | ~15% | Models Prisma **existem**. Falta TODA a lógica de negócio e as telas funcionais. |
| FASE 2 · Compromissos e crédito | Cartões, parcelas, recorrências, calendário, alertas, worker | ~10% | Models `CreditCard`, `Invoice`, `RecurrenceRule`, `Obligation` **existem**. Worker tem só stub. Nenhuma regra implementada. |
| FASE 3 · Planejamento | Orçamentos, metas, saldo projetado, cenários | ~10% | Models `Budget`, `Goal` **existem**. Nenhuma regra/cálculo implementado. |
| FASE 4 · Portabilidade e colaboração | CSV/OFX, conciliação, espaços familiares, comprovantes | ~5% | `Membership` existe; variáveis de ambiente `S3_*` reservadas. Falta resto. |
| FASE 5 · Integrações e escala | Open Finance, offline completo, multi-moeda, microserviços | 0% | Nada implementado. |

---

## 2. O que JÁ ESTÁ implementado na Fase 0 (base sólida)

- ✅ **Monorepo pnpm workspaces + Turborepo 2**: 5 apps + 4 packages com `pnpm-workspace.yaml`, cache turbo, tasks `typecheck`, `lint`, `build`, `db:generate` em [`turbo.json`](../turbo.json).
- ✅ **Stack por módulo 100% coerente com a proposta**: NestJS 10, Prisma 5, Next 15 App Router, Expo 52, Tauri 2, BullMQ 5, Zod, Tailwind/NativeWind/Dinero.js.
- ✅ **Ambiente local**: PostgreSQL 17 + Redis 7 + MailHog em [`docker-compose.yml`](../docker-compose.yml) (perfis `default` e `full`).
- ✅ **Banco de dados modelado**: 16 models do domínio + 11 enums materializados em [`apps/api/prisma/schema.prisma`](../apps/api/prisma/schema.prisma) com relações bidirecionais e constrains corretos (validados por `prisma validate`).
- ✅ **Pacotes compartilhados**:
  - `@scf/validation` — `MoneyAmount` (4 casas decimais, string), `IsoDate`, `CurrencyCode`, etc.
  - `@scf/api-contracts` — `DashboardSummary`, `AuthResponse` + DTOs compartilhados.
  - `@scf/design-tokens` — paleta, espaçamentos, tipografia, sombras, breakpoints.
  - `@scf/config` — `tsconfig.*.json` base (next/node/react), ESLint 9 flat config, Prettier.
- ✅ **Autenticação + autorização base** (camada API): `JwtAuthGuard`, `SpaceRoleGuard`, decorators `@CurrentUser()`, `@CurrentSpaceId()`, `@Roles()` em [`apps/api/src/common/auth/auth.guard.ts`](../apps/api/src/common/auth/auth.guard.ts).
- ✅ **Health + observabilidade mínima**: `health.controller.ts` com checagem do Postgres + `CorrelationIdMiddleware` (X-Correlation-Id).
- ✅ **Idempotência, auditoria, outbox**: 3 models já declarados no schema Prisma: `IdempotencyRecord`, `AuditLog`, `OutboxEvent`.
- ✅ **Scaffold das apps** (estruturas de pastas e rotas prontas):
  - Web: Next App Router `/login`, `/register`, `/app/*`, AuthContext, React Query, React Hook Form.
  - Mobile: Expo Router tabs `(public)` / `(private)`, NativeWind, `expo-router/entry`.
  - Desktop: Tauri 2 com main.rs, capabilities, permissões `allow-http:default` para localhost:3001.
  - Worker: BullMQ com Pino logger, estrutura para queues e workers.
- ✅ **Typecheck 100%**: `pnpm typecheck` roda **8/8 packages successful** em `@scf/api, @scf/worker, @scf/validation, @scf/design-tokens, @scf/api-contracts, @scf/web, @scf/mobile, @scf/desktop`.
- ✅ **Limpeza de sujeira**: 43 itens removidos (arquivos `_tmp_*` corrompidos, pastas duplicadas em `@scf/*_tmp_*`, `.prisma` duplicado de 20MB, tsbuildinfo, turbo logs).
- ✅ **README da raiz** com instruções de rodar, portas, conceitos de domínio e gotchas críticos.

---

## 3. O que AINDA FALTA na Fase 0 (20% restante)

Ordem de prioridade (🔴 crítico → 🟡 médio).

| Prioridade | Item | Motivo | Onde planejado |
|---|---|---|---|
| 🔴 1 | **Migration.sql REAL + seed** | A pasta `apps/api/prisma/migrations/20260821000000_init_schema/` existe, mas o SQL REAL ainda não foi materializado a partir do schema. Seed de categorias DEFAULT_CATEGORIES também não roda. Hoje não dá para subir a API conectada ao banco sem rodar `prisma migrate dev`. | [07-roadmap § Fase 0](./07-roadmap.md#L23) |
| 🔴 2 | **Fluxo autenticação real end-to-end com TELAS (web primeiro)** | Hoje `identity.controller.ts` tem endpoints stub (não validam senha de verdade, não geram `Membership` owner no create space). Telas web/mobile/desktop de login/register/cadastrar-space são **placeholders**. Não existe o fluxo "cadastro → login → criar espaço → dashboard vazio" funcionando. | [07-roadmap § critérios de saída](./07-roadmap.md#L27-L28) |
| 🔴 3 | **Decidir e implementar OIDC vs MVP JWT local + PKCE no mobile/desktop** | Doc de segurança pede OIDC + PKCE ([06-NFR § 1.1](./06-requisitos-nao-funcionais.md#L7-L14) e [08-desktop § SSO](./08-aplicativo-desktop.md#L98-L109)). Hoje só existe JWT interno do Nest sem provider OIDC. `expo-secure-store` não está em uso (mobile usa AsyncStorage). Desktop não implementou PKCE flow. Alternativa: MVP com JWT local + bcrypt + telas funcionais, e OIDC fica para o fim da Fase 0/início Fase 1 (decisão do dono do produto). | [06-requisitos-nao-funcionais § 1.1](./06-requisitos-nao-funcionais.md#L7-L14) |
| 🟠 4 | **ESLint 9 flat config nas 5 apps** (lint 100% zerado) | Só `packages/config/` tem `eslint.config.js`. Apps `api`, `worker`, `mobile`, `desktop` não têm arquivo (hoje `turbo run lint` não passa). Web precisa rodar `next lint` 1 vez para remover prompt interativo. | [06-requisitos-nao-funcionais § qualidade](./06-requisitos-nao-funcionais.md#L129-L138) |
| 🟠 5 | **Build de desenvolvimento Tauri REAL (Rust compilado)** | Hoje só roda a WebView Vite. Não foi testado `pnpm --filter @scf/desktop tauri:dev` (requer Rust toolchain + WebView2 SDK no Windows). Critério de saída da Fase 0 pede desktop em build de dev funcionando. | [07-roadmap § critérios de saída](./07-roadmap.md#L27-L28) ; [08-aplicativo-desktop.md § ambiente](./08-aplicativo-desktop.md#L177-L186) |
| 🟠 6 | **Pipeline CI/CD mínimo + ambiente de homologação** | Nenhum workflow CI (GitHub Actions / etc). Sem runner que rode `typecheck`, `lint`, `test:unit`. Sem ambiente de staging/homologação. | [07-roadmap § Fase 0](./07-roadmap.md#L18-L24) |
| 🟡 7 | **OpenTelemetry + Pino logger estruturado na API** | Só `correlation-id.middleware` existe. Falta OTEL SDK, Pino na API (worker já usa Pino), exportação OTLP, métricas Prometheus. | [06-requisitos-nao-funcionais § observabilidade](./06-requisitos-nao-funcionais.md#L91-L115) ; [03-tecnologias § observabilidade](./03-tecnologias.md#L24) |
| 🟡 8 | **Threat model + classificação de dados / LGPD** | Documento escrito não existe. Medidas técnicas estão OK (JWT guards, Helmet, rate-limit, env seguro), mas falta artefato de governança: mapa de tratamento, retenção, DPO. | [07-roadmap § Fase 0](./07-roadmap.md#L24) ; [06-requisitos-nao-funcionais § segurança](./06-requisitos-nao-funcionais.md#L3-L47) |
| 🟡 9 | **Segundo fator + recuperação de senha** | Identity module não implementa MFA nem forgot password. | [04-funcionalidades § identidade](./04-funcionalidades.md#L15-L16) |
| ⚪ 10 | **Validação das 9 perguntas abertas de produto** | MVP familiar vs pessoal, cartão de crédito entra no MVP, planos pagos, nuvem, Open Finance, comprovantes, offline, SO desktop primeiro, lojas. Todas em aberto em `doc/README.md §42-54`. Não bloqueia código, mas evita retrabalho se decidido cedo. | [doc/README.md](./README.md#L42-L54) |

---

## 4. Lições aprendidas HARD (não repetir!)

> Essas dores custaram **horas** para diagnosticar. **Não apague seletivamente**. Mantenha este documento.

### 4.1 Google Drive / nuvem sincronizada CORROMPE o pnpm / node_modules

**Sintoma**: `pnpm install` trava sem fim, ou termina com pastas `*_tmp_*` resquícios em `node_modules/@types/` ou `node_modules/@scf/` que quebram typecheck com `TS2688 Cannot find type definition for node_tmp_XXXXXX`.

**Causa raiz**: O `.npmrc` original apontava `store-dir`, `cache-dir`, `state-dir` para `G:\Meu Drive\proj\...`. O Google Drive tranca arquivos durante a sincronização no meio de operações atômicas do pnpm.

**Correção aplicada e NÃO REVERTER**:
- `.npmrc` usa **paths relativos LOCAIS** ao projeto:
  ```
  store-dir=.pnpm-store
  cache-dir=.pnpm-cache
  state-dir=.pnpm-state
  ```
- Regra fixa: o projeto SCF **nunca deve viver em pastas sincronizadas por nuvens** (Google Drive, OneDrive, Dropbox). Caminhos locais SSD (`C:\proj`, `~/proj`) apenas. Já gravado em [README raiz § 9.1](../README.md#L151-L164).

### 4.2 pnpm-workspace.yaml sumindo (renomeado para .bak)

**Sintoma**: `pnpm install` não reconhece workspaces, instala tudo 5 vezes (por app), e o Turborepo não encontra tasks.

**Causa raiz**: arquivo foi renomeado `pnpm-workspace.yaml.bak` em alguma cópia/versão anterior.

**Ação imediata se acontecer**: renomeie de volta para `pnpm-workspace.yaml` com conteúdo `packages: [apps/*, packages/*]`.

### 4.3 Prisma 5 + `node-linker=hoisted` (pnpm) quebra resolução de tipos

**Sintoma**: +60 erros `TS2305: Module '@prisma/client' has no exported member User / CurrencyCode / etc.`

**Causa raiz**: o entrypoint `.d.ts` do `@prisma/client/default.d.ts` faz:
```ts
export * from '.prisma/client/default';
```
Esse caminho é **RELATIVO À PASTA DO PACOTE** (`node_modules/@prisma/client/`), **não** à raiz do workspace. Com hoisting, o pacote fica 1 nível acima (`node_modules/@prisma/client` na raiz) sem a subpasta `.prisma/client/` gerada por cada app, e o TypeScript não acha os exports.

**Correção aplicada (3 pilares — NÃO MEXA)**:
1. **`.npmrc`** tem `public-hoist-exclude[]=@prisma/*` e `public-hoist-exclude[]=prisma` — evita hoisting do Prisma para a raiz quando houver cópia local.
2. **Cópia LOCAL** dos pacotes `@prisma/client` e `prisma` de `node_modules/` para `apps/api/node_modules/` e `apps/worker/node_modules/` (cada app com seu Prisma local resolvível).
3. **Generator output custom** no schema:
   ```prisma
   generator client {
     provider = "prisma-client-js"
     output   = "../node_modules/@prisma/client/.prisma/client"
   }
   ```
   Isso faz o Prisma gerar os tipos **EXATAMENTE** na subpasta `.prisma/client/` **DENTRO** da cópia local do `@prisma/client` da app, o entrypoint relativo acha, e os types funcionam.

### 4.4 Não deixe `.prisma/client` DUPLICADO solto em `apps/*/node_modules/.prisma/`

Havia uma pasta `.prisma` DUPLICADA de **20.72 MB** em `apps/api/node_modules/.prisma/` fora do `@prisma/client/`. Ela era **ociosa** (nenhum importava dela, só a de dentro). Já foi apagada. Ao rodar `prisma generate`, confirme que o output cai **apenas** dentro de `apps/api/node_modules/@prisma/client/.prisma/client/`.

### 4.5 tsconfig paths só aceitam 1 wildcard (TS5062)

**Sintoma**: `TS5062: Substitution pattern can have at most one '*' character.`

**Causa raiz**: um path antigo da API era `@domain/*: ["src/*/domain/*"]` — dois wildcards ilegais.

**Padrão atual correto** em [`apps/api/tsconfig.json`](../apps/api/tsconfig.json):
```json
"@/*":       ["src/*"],
"@domain/*": ["src/domain/*"],
"@app/*":    ["src/application/*"],
"@infra/*":  ["src/infrastructure/*"]
```

### 4.6 Prisma schema: relações bidirecionais são OBRIGATÓRIAS

4 erros `P1012` de validação foram corrigidos no schema. São sempre:
- Relação inversa ausente em 1:N (ex: `FinancialSpace` **deve** declarar `recurrenceRules RecurrenceRule[]` e `obligations Obligation[]`, pois os 2 models apontam para ele).
- Relação `Category 1:N Budget` precisa ter `budgets Budget[]` no lado 1.
- Relação **one-to-one** precisa de `@unique` na FK (ex: `Obligation.transactionId` para `reconciledTransaction` 1:1).

Sempre rode `pnpm db:validate` ou `pnpm db:generate` e trate erros de relation antes de migrar.

### 4.7 Limpeza segura de caches/artifacts

Use `pnpm clean` (definido em package.json raiz). Ele **não apaga** `node_modules` (economiza 7 min de reinstall). Apaga só dist, .turbo, build, tsbuildinfo, out, .expo — coisas recriáveis rápido.

---

## 5. Comandos de sanidade (rodar antes de começar qualquer dia)

```bash
pnpm install            # Garante dependências
pnpm typecheck          # 8/8 successful = tudo ok (100% hoje)
pnpm lint               # Falta corrigir (hoje não passa em todas as apps)
pnpm test:unit          # Vitest (poucos testes escritos por enquanto)

# Se mudar o schema Prisma:
pnpm db:validate        # Valida schema (rápido)
pnpm db:generate        # Re-gera o Prisma Client LOCAL em apps/api e apps/worker

# Se mudar .npmrc / pnpm-workspace.yaml: pnpm install de novo
```

---

## 6. Próximos 4 passos recomendados (fechar a Fase 0)

**Definição de FEITO Fase 0**: Conseguir, sem o Trae/eu, rodar `pnpm install` → `docker compose up -d postgres redis` → `pnpm db:migrate` → `pnpm dev:api` → `pnpm dev:web` → **na UI web**: cadastrar usuário → logar → criar espaço financeiro → ver dashboard vazio com saudação do usuário + lista de espaços. Depois repetir fluxo similar em build de dev do desktop.

Ordem:

1. **🔹 Migration real + seed**: rodar `pnpm --filter @scf/API prisma migrate dev --name init_schema` para materializar o SQL REAL, confirmar que Postgres tem as 16 tabelas, rodar `db:seed` de categorias padrões.
2. **🔹 Decidir autenticação**: (a) MVP JWT local bcrypt completo + telas funcionais **OU** (b) Colocar Keycloak/Ory Kratos no docker-compose e integrar OIDC no Nest + PKCE no mobile/desktop. Decisão por MVP (a) acelera em 1 semana a entrega do fluxo crítico Fase 0.
3. **🔹 Fluxo web completo**: implementar em `apps/web` (e depois espelhar mobile/desktop) chamadas HTTP reais para `POST /identity/register`, `POST /identity/login`, `POST /financial-spaces`, `GET /financial-spaces/:id/summary` salvando token em `localStorage`/SecureStore, conectando AuthContext de verdade e removendo placeholders.
4. **🔹 Lint + CI básico**: criar `eslint.config.js` flat nas 4 apps faltantes (usando `@scf/config` como base) + `next lint` setup automático na web. Adicionar workflow GitHub Actions (`.github/workflows/ci.yml`) que roda `pnpm install --frozen-lockfile` → `pnpm typecheck` → `pnpm lint` → `pnpm test:unit` em todo push para `main` e em PRs.

Depois destes 4 passos: **Fase 0 estará 100% fechada** e pode-se iniciar Fase 1 (núcleo financeiro: contas, categorias, lançamentos, dashboard populado com dados reais).

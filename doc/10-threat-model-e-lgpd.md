# Threat model inicial, classificação de dados e diretrizes LGPD

> Status: **versão inicial (Fase 0)**
> Última atualização: 5 de novembro de 2026
> Escopo: API `@scf/api`, worker `@scf/worker`, clientes web/mobile/desktop e infraestrutura local.
> Complementa [doc/06-requisitos-nao-funcionais.md](./06-requisitos-nao-funcionais.md) § Segurança/Privacidade.
> **Este documento é técnico e não substitui análise jurídica e de privacidade.**

## 1. Objetivo e método

Identificar ativos, ameaças e controles do SCF, classificar os dados tratados e registrar as obrigações LGPD que condicionam o desenho do sistema antes de qualquer exposição a produção.

Método: modelo simplificado baseado em **STRIDE** (Spoofing, Tampering, Repudiation, Information disclosure, Denial of service, Elevation of privilege) aplicado aos fluxos reais já implementados. Cada ameaça recebe um controle e um status (`implementado`, `planejado`, `aceito`).

## 2. Ativos

| Ativo | Onde vive hoje | Sensibilidade |
|---|---|---|
| Credenciais de acesso (`passwordHash`, refresh tokens) | `users.passwordHash`, payload JWT | Crítico |
| Identidade pessoal (`email`, `name`, `pictureUrl`, `oidcSub`, `timezone`, `locale`) | `users` | Alto |
| Dados financeiros (`Account`, `Transaction`, `Posting`, `Invoice`, `Budget`, `Goal`, `Obligation`) | tabelas por `financialSpaceId` | Alto |
| Vínculos e papéis (`Membership`, `invitedEmail`) | `memberships` | Alto |
| Trilha de auditoria (`AuditLog.safeSummary`, `correlationId`) | `audit_logs` | Médio |
| Chaves e segredos (`JWT_SECRET`, `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, chaves S3) | variáveis de ambiente / `.env` | Crítico |
| Telemetria e logs | Pino (stdout JSON) + OTLP | Médio |
| Banco PostgreSQL, Redis e backups | Docker local / nuvem futura | Crítico |

## 3. Limites de confiança

```
[Web/Mobile/Desktop] --HTTPS--> [API NestJS] --SQL--> [PostgreSQL]
                                     |----> [Redis / BullMQ Worker]
                                     |----> [S3 (comprovantes, fase 4)]
                                     |----> [OTLP collector]
```

Fronteiras que exigem validação: cliente → API (não confiável, autenticado ou não); API → banco (rede privada, credencial por variável de ambiente); worker → API/banco (jobs assíncronos, payloads de `OutboxEvent`).

## 4. Threat model (STRIDE)

| # | Categoria | Ameaça | Controle | Status |
|---|---|---|---|---|
| T1 | Spoofing | Roubo/reuso de access token ou refresh token | Access token curto (`JWT_ACCESS_TTL=3600`) + refresh com rotação; `JwtAuthGuard` em rota protegida; `@Public()` explícito onde não há auth | implementado (JWT); rotação planejada |
| T2 | Spoofing | Adivinhação/força bruta de senha | bcrypt cost 12; `express-rate-limit`; mensagens de erro genéricas no login | implementado; rate limit por rota a validar |
| T3 | Spoofing | Login federado forjado (OIDC) | Validação de `issuer`, `audience`, `state` e PKCE no callback; e-mail verificado para operações sensíveis | implementado (OIDC Authorization Code + PKCE — ver [ADR 001](./11-adr-oidc-pkce.md)); e-mail verificado a validar |
| T4 | Tampering | Alteração de lançamento alheio | `SpaceRoleGuard` + `@Roles()`; toda consulta filtrada por `financialSpaceId`; verificação no caso de uso, não só na UI | implementado |
| T5 | Tampering | Reexecução de requisição financeira (duplicidade) | `Idempotency-Key` com `IdempotencyRecord` (`@@unique([financialSpaceId, idempotencyKey])`) | implementado |
| T6 | Tampering | Escrita parcial em operação multi-registro | Transação Prisma + constraints que duplicam invariantes | implementado |
| T7 | Repudiation | Negação de uma operação financeira | `AuditLog` com `operation`, `entityType`, `entityId`, `safeSummary` e `correlationId` | implementado (parcial: ver §7) |
| T8 | Information disclosure | Vazamento de credencial/token em log | Pino com `redact` de `authorization`, `cookie`, `password`, `refreshToken`, `set-cookie` | implementado |
| T9 | Information disclosure | Acesso a espaço financeiro indevido | Guard de espaço + filtro obrigatório por `financialSpaceId` em toda query | implementado; teste de autorização cruzada pendente |
| T10 | Information disclosure | Exposição de dados em repouso ou backup | Criptografia em repouso (disco/banco/backup) e TLS em trânsito no ambiente de produção | planejado (infra de produção) |
| T11 | Information disclosure | Payload financeiro vazando para telemetria | Auto-instrumentation não coleta payload; traces sem corpo de requisição; OTLP desabilitado por padrão (`OTEL_ENABLED=false`) | implementado |
| T12 | Denial of service | Consultas sem limite / requisições inundando a API | Paginação por cursor; rate limit; health check isolado (`/health`) | implementado (parcial) |
| T13 | Elevation of privilege | Escalar de `contributor` para `owner` sem autorização | Papéis validados por `SpaceRoleGuard` no servidor; convite de membro restrito | implementado |
| T14 | Elevation of privilege | Abuso de superfície do desktop (Tauri) | CSP restritiva; capacidades Tauri mínimas por janela; conteúdo privilegiado local | planejado (build Tauri real) |
| T15 | Supply chain | Dependência maliciosa ou vulnerável | `pnpm-lock.yaml` + `--frozen-lockfile` no CI; revisão de dependências | implementado (revisão automatizada de vulnerabilidades pendente) |
| T16 | Configuração | Segredo versionado no repositório | `.env.example` sem valores reais; segredos por variável de ambiente/cofre | implementado |

## 5. Classificação de dados

| Classe | Definição | Exemplos no SCF | Regras mínimas |
|---|---|---|---|
| **P1 · Crítico** | Compromete identidade ou integridade financeira | `passwordHash`, refresh tokens, `JWT_SECRET`, credenciais de banco/S3 | Nunca em log; criptografia em repouso; acesso mínimo; rotação em incidente |
| **P2 · Pessoal** | Identifica direta ou indiretamente a pessoa | `email`, `name`, `pictureUrl`, `oidcSub`, `invitedEmail`, `timezone`, `locale` | Base legal + finalidade; minimizar; atender acesso/correção/portabilidade/eliminação |
| **P3 · Financeiro** | Hábito e situação financeira | `Account`, `Transaction`, `Posting`, `Invoice`, `Budget`, `Goal`, `Obligation` | Isolar por `financialSpaceId`; nunca em log/telemetria; retenção definida |
| **P4 · Operacional** | Suporte à operação e segurança | `AuditLog`, `IdempotencyRecord`, `OutboxEvent`, métricas | `safeSummary` sem dado sensível; retenção própria |
| **P5 · Público** | Sem risco se exposto | versão da API, `correlationId`, nomes de enum | Sem restrição especial |

Regra de ouro já codificada: **P1 e P3 nunca aparecem em log**. O `redact` do Pino e o `safeSummary` do `AuditLog` são os pontos que fazem cumprir isso.

## 6. Diretrizes LGPD

| Requisito | Aplicação no SCF | Status |
|---|---|---|
| Base legal e finalidade | Execução de contrato para dados de conta/financeiro; consentimento para integrações externas e notificações | a documentar |
| Minimização | Só coletar o necessário ao controle financeiro; `User.name` e `pictureUrl` opcionais | implementado no schema |
| Transparência | Política de privacidade + termos a publicar antes da produção | planejado |
| Acesso e correção | `GET /identity/me` e atualização de perfil | parcialmente implementado |
| Portabilidade | Exportação de dados por espaço (CSV/OFX, fase 4) | planejado |
| Eliminação | Exclusão de conta/space com definição do destino de `AuditLog` (hoje `onDelete: SetNull` preserva a trilha) e de backups | planejado |
| Segurança | Criptografia, controle de acesso por papel, registros de auditoria | parcial (§4) |
| Retenção | Prazos por classe de dado, inclusive `IdempotencyRecord.expiresAt` | a definir |
| Incidentes | Runbook de resposta e comunicação | planejado (ver doc/06 § Operação) |
| Subprocessadores | Cofre de segredos, provedor de e-mail, S3, OTLP | a mapear antes de produção |

### 6.1 Operadores e subprocessadores (a confirmar)

A definir quando houver ambiente de produção: provedor de nuvem/banco gerenciado, serviço de e-mail, armazenamento de objetos (S3 compatível), backend OTLP e provedor de identidade (hoje Keycloak em Docker no ambiente local/homologação; ver [ADR 001](./11-adr-oidc-pkce.md)).

### 6.2 Retenção proposta (a validar)

- `IdempotencyRecord`: expurgo via `expiresAt` (índice já existe para isso).
- Logs/telemetria: retenção curta (ex.: 30 dias para logs de acesso; traces por amostragem).
- `AuditLog`: prazo maior (ex.: 5 anos) por valor probatório, anonimizando referências de usuário quando aplicável.
- Backups: janela própria; exclusão solicitada pelo titular é propagada na próxima janela de reciclagem, registrando a impossibilidade de apagamento pontual.

## 7. Lacunas conhecidas (priorizadas)

1. **Teste de autorização cruzada** entre espaços financeiros (garante T4/T9) — hoje não há teste automatizado cobrindo acesso indevido.
2. **Rotação de refresh token e revogação de sessão** após troca de credencial (T1).
3. **Revisão de vulnerabilidades de dependências** no pipeline (T15).
4. **Criptografia em repouso e TLS** pressupõem infraestrutura de produção, ainda inexistente (T10).
5. **`AuditLog` incompleto**: nem toda operação sensível grava trilha; `safeSummary` precisa de revisão para não carregar P2/P3.
6. **MFA (TOTP) e recuperação de senha** implementados; falta validar políticas (reenvio, expiração de códigos de recuperação) e testes (relacionado a T2/T3).
7. **Política de privacidade/termos e mapa de subprocessadores** inexistentes.

## 8. Próximas ações

- Adicionar testes de autorização por espaço na suíte da API.
- Definir e implementar a retenção/expurgo de `IdempotencyRecord` e logs.
- Documentar o mapa de subprocessadores quando o ambiente de produção for escolhido.
- Revisar todos os pontos de escrita de `AuditLog` para garantir cobertura e ausência de dados P2/P3.
- Reavaliar este documento a cada nova integração externa (Open Finance, S3, notificações).

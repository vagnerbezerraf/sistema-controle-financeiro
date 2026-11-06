# ADR 001 · Autenticação federada com OIDC Authorization Code + PKCE

> Status: **Aceito**
> Data: 6 de novembro de 2026
> Fase do roadmap: **Fase 0 (Fundação e scaffold)**
> Referência: [doc/09-estado-atual-e-checklist.md](./09-estado-atual-e-checklist.md), [doc/06-requisitos-nao-funcionais.md](./06-requisitos-nao-funcionais.md)

## Contexto

A Fase 0 exigia definir como a identidade seria tratada. O critério de saída da fase era atendido por um MVP com JWT local (registro/login com e-mail e senha). Porém, o produto prevê SSO para os clientes desktop e mobile e a possibilidade de delegar a autenticação a um provedor externo, o que recomendava decidir cedo o formato da federação de identidade para não retrabalhar os contratos depois.

Os clientes (web, mobile, desktop) são **clientes públicos** — não conseguem guardar um `client_secret` em segurança. Esse é o requisito que determina o fluxo OAuth2/OIDC adequado: **Authorization Code + PKCE**.

## Decisão

1. **Manter o JWT local do SCF como autoridade final.** A API continua emitindo seus próprios access/refresh tokens; toda a autorização existente (`JwtAuthGuard`, `SpaceRoleGuard`, memberships, `spaceIds` no payload) permanece intacta.
2. **Adotar OIDC Authorization Code + PKCE (S256)** como fluxo de federação. Os clientes fazem o redirect ao provedor e devolvem o `code` + `code_verifier` à API, que troca o code por token, lê o `userinfo` e então emite os JWTs do SCF.
3. **Usar Keycloak como provedor de identidade** no ambiente de desenvolvimento/homologação, em Docker (`quay.io/keycloak/keycloak:26.0`, `start-dev --import-realm`), com o realm versionado em [`infra/containers/keycloak/realm-scf.json`](../infra/containers/keycloak/realm-scf.json).
4. **Clientes públicos** (sem secret) para web/mobile/desktop. O suporte a `client_secret` fica opcional (`OIDC_CLIENT_SECRET`), caso um cliente confidencial seja configurado no futuro.

## Fluxo

```text
Cliente (web/mobile/desktop)
  1. GET /identity/oidc/config?client=...   → { enabled, issuer, clientId, redirectUri, scopes, authorizationEndpoint }
  2. gera code_verifier + code_challenge (S256) localmente
  3. redirect para authorizationEndpoint com code_challenge
  Provedor OIDC (Keycloak)
  4. autentica e redireciona de volta ao redirectUri com ?code=...
Cliente
  5. POST /identity/oidc/exchange { code, codeVerifier, redirectUri }
API
  6. troca o code no token_endpoint (com code_verifier)
  7. lê o userinfo (sub, email, name, email_verified)
  8. findOrCreateOidcUser: vincula pelo e-mail ou cria conta + espaço padrão
  9. emite os JWTs do SCF → resposta AuthResponse
```

## Consequências

**Positivas**

- SSO pronto para todos os clientes, sem expor credenciais (fluxo PKCE, adequado a clients públicos).
- A autorização do SCF permanece centralizada nos seus próprios JWTs, independente do provedor usado.
- Provedor de identidade versionado e reproduzível via Docker, sem dependência de serviço externo no desenvolvimento.

**Negativas / custos**

- Mais um componente de infraestrutura (Keycloak) e mais variáveis de configuração para operar.
- Necessário distinguir o **issuer público** (navegador: `http://localhost:8080/realms/scf`) do **issuer interno** (container da API: `http://keycloak:8080/realms/scf`). O discovery é lido pela URL interna e reescrito para a pública (`toPublic()`) antes de chegar ao cliente.
- O login local (e-mail/senha) continua existindo em paralelo, mantendo dois caminhos de autenticação a manter e testar.

## Alternativas consideradas

| Alternativa | Motivo da rejeição |
|---|---|
| **Apenas JWT local (sem OIDC)** | Atenderia o MVP, mas forçaria retrabalho nos contratos ao introduzir SSO depois. |
| **OIDC com direct grant (Resource Owner Password)** | Clientes são públicos e o provedor escolhido não suporta direct grant para clients públicos; além disso, ROPC é desencorajado. |
| **Authorization Code sem PKCE** | Inseguro para clientes públicos (interceptação do `code`); PKCE (S256) é a mitigação obrigatória. |
| **Provedor SaaS externo (Auth0/Okta)** | Custo e dependência de terceiros; o Keycloak em Docker mantém o ambiente local autossuficiente. |

## Variáveis de configuração

- `OIDC_ISSUER_URL` — issuer público visto pelos clientes (ex.: `http://localhost:8080/realms/scf`).
- `OIDC_INTERNAL_ISSUER_URL` — issuer interno visto pela API dentro do Docker (ex.: `http://keycloak:8080/realms/scf`).
- `OIDC_CLIENT_ID_WEB` / `OIDC_CLIENT_ID_MOBILE` / `OIDC_CLIENT_ID` (desktop).
- `OIDC_REDIRECT_URI_WEB` / `OIDC_REDIRECT_URI_MOBILE` / `OIDC_REDIRECT_URI_DESKTOP`.
- `OIDC_SCOPES` (default `openid profile email`).
- `OIDC_CLIENT_SECRET` (opcional; vazio para clientes públicos).

Se `OIDC_ISSUER_URL` estiver vazio ou o provedor estiver indisponível, o SSO é ocultado e o login local segue funcionando (degradação graciosa).

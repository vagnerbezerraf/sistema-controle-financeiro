# Roadmap sugerido

## Estratégia

Entregar o produto em fatias verticais: cada etapa deve atravessar interface, API, dados, segurança, testes e operação. O objetivo não é construir todo o backend antes das interfaces, mas validar cedo os fluxos que podem revelar erros no domínio financeiro.

## Fase 0 — descoberta e fundação

### Objetivo

Eliminar ambiguidades de produto e preparar uma base pequena que possa ser entregue com segurança.

### Entregas

- Entrevistas e protótipo dos fluxos de registro, parcelamento, fatura e planejamento.
- ✅ Validação das decisões listadas no [índice](./README.md#decisões-que-precisam-de-validação-do-produto) — as 9 perguntas decididas (ver [Status de validação](./README.md#status-de-validação-das-decisões)).
- Definição do glossário e das regras financeiras.
- Monorepo, padrões de código e pipeline.
- Ambientes local e de homologação.
- Provedor de identidade.
- Esqueleto da API, web, mobile e desktop.
- Definição do primeiro sistema operacional desktop suportado e da estratégia de distribuição.
- PostgreSQL, migrações e telemetria básica.
- Threat model inicial e classificação dos dados.

### Critério de saída

Uma pessoa consegue autenticar-se na web, no mobile e em um build de desenvolvimento do desktop, criar um espaço financeiro e acessar uma rota protegida; pipeline, migração, logs e ambiente de homologação funcionam.

## Fase 1 — núcleo financeiro

### Objetivo

Oferecer controle manual confiável do presente.

### Entregas

- Contas e saldo inicial.
- Categorias e etiquetas.
- Receitas, despesas, transferências, ajustes e estornos.
- Histórico com filtros.
- Dashboard mensal básico.
- Idempotência, concorrência otimista e auditoria.
- Exportação inicial.
- Cliente desktop com os fluxos essenciais, instalador do sistema operacional inicial e assinatura em ambiente de release.
- Testes E2E dos fluxos essenciais.

### Critério de saída

Saldos e totais permanecem consistentes em cenários de repetição de requisição, edição, estorno e transferência; os mesmos dados aparecem corretamente na web, no mobile e no desktop.

## Fase 2 — compromissos e crédito

### Objetivo

Representar obrigações futuras sem distorcer o saldo realizado.

### Entregas

- Cartões, ciclos e faturas.
- Compra parcelada.
- Recorrências.
- Contas a pagar e receber.
- Calendário financeiro.
- Alertas de vencimento.
- Worker, outbox e fila: outbox transacional drenado pelo worker (retry/backoff/dead-letter) e jobs de **recorrências** (top-up do horizonte, reexecutável), **lembretes de vencimento** (e-mail real por **SMTP** ao membro, com horário silencioso e idempotência diária) e **manutenção do cache de relatórios** (`reports:cache`, evicção de jobs finalizados além da retenção); sem placeholders no worker; ver checklist §2.20, §2.37 e §2.38.

### Critério de saída

A soma das parcelas sempre coincide com a compra; cada parcela entra na fatura esperada; pagar uma fatura não duplica despesas; jobs podem ser reexecutados sem duplicação.

## Fase 3 — planejamento

### Objetivo

Permitir que o usuário tome decisões olhando para frente.

### Entregas

- Orçamento por categoria.
- Saldo projetado.
- Metas e contribuições.
- Alertas de orçamento e saldo negativo.
- Comparações mensais.
- Cenários simples.

### Critério de saída

O usuário identifica claramente realizado, comprometido e projetado, consegue explicar a origem de cada número e simular mudanças sem alterar o histórico.

## Fase 4 — portabilidade e colaboração

### Objetivo

Reduzir trabalho manual e ampliar o uso familiar.

### Entregas

- Importação CSV com prévia e deduplicação.
- Importação OFX.
- Conciliação.
- Espaços familiares, convites e papéis.
- Preferências de privacidade e notificação.
- Comprovantes, se validados.
- Relatórios avançados.

### Critério de saída

Importações podem ser auditadas e desfeitas; itens duplicados são detectados; um membro não acessa espaços ou ações fora de sua permissão.

## Fase 5 — integrações e escala

### Objetivo

Adicionar automação externa somente depois de o núcleo estar estável.

### Possíveis entregas

- Integração com agregador/Open Finance mediante consentimento.
- Sincronização incremental.
- ✅ **Regras avançadas de categorização** — entregue (1ª fatia da Fase 5): CRUD com precedência, casamento pela descrição, aplicação retroativa e categorização no commit da importação; ver checklist §2.34.
- ✅ **Relatórios assíncronos** — entregue (3ª fatia da Fase 5): pedido de exportação de lançamentos enfileirado via **outbox transacional** e processado em background pelo worker (`pending`/`running`/`done`/`error`), com **cache do CSV** no resultado do job e consulta/download pela UI, com paridade Web/Desktop/Mobile; ver checklist §2.36.
- ✅ **Múltiplas moedas** — entregue (2ª fatia da Fase 5): taxas de câmbio por par com vigência por data, conversão dos totais consolidados (dashboard e patrimônio líquido) para a moeda de reporte do espaço, taxa inversa/identidade, contagem de lançamentos sem taxa e bloqueio de transferência entre moedas diferentes, com paridade Web/Desktop/Mobile; ver checklist §2.35.
- ✅ **Modo offline (núcleo compartilhado + Desktop/Mobile)** — entregue (4ª fatia da Fase 5): pacote puro `@scf/offline` com **fila de escritas** (FIFO, backoff exponencial, idempotência) e **cache de leitura**; no Desktop (localStorage) e no Mobile (SecureStore) o `apiFetch` passa a cachear as leituras e a enfileirar as escritas quando a rede cai, com faixa de status e sincronização automática ao reconectar; ver checklist §2.39.
- ✅ **Offline no Web e reconciliação de conflitos** — entregue (5ª fatia da Fase 5): o mesmo núcleo `@scf/offline` passa a servir o Web (localStorage) com paridade Desktop/Mobile; e a fila ganha **reconciliação de conflitos** — a escrita que bate em `version` desatualizada (HTTP 409 / `STALE_VERSION`) fica retida com status `conflict`, **não** consome tentativas nem entra em retentativa automática, e usa `conflictCount()`/`discardConflicts()` para decisão manual do usuário; ver checklist §2.40.
- ✅ **Open Finance (agregador com consentimento)** — entregue (6ª fatia da Fase 5): consentimento por espaço/instituição com ciclo de vida (`pending`/`authorized`/`rejected`/`expired`/`revoked`), conectar/listar/reconsultar/revogar atrás de um `OpenFinanceProvider` injetável (stub de desenvolvimento, sem rede), com paridade Web/Desktop/Mobile; ver checklist §2.41.
- ✅ **Sincronização incremental** — entregue (7ª fatia da Fase 5): importação dos lançamentos do agregador para uma conta do espaço em **páginas por cursor**, **deduplicados por identificador externo**, gravando `Transaction`+`Posting` numa única transação junto do cursor/`lastSyncedAt`/auditoria, com paridade Web/Desktop/Mobile; ver checklist §2.42.
- ✅ **Sincronização automática do Open Finance** — entregue (8ª fatia da Fase 5): job repetível no worker (`open-finance:sync`, a cada 6h) que percorre os consentimentos **autorizados** e importa o que houver de novo, reusando as decisões da sync manual, com **idempotência por identificador externo** e **tolerância à indisponibilidade** de cada provedor; ver checklist §2.43.
- ✅ **Distribuição oficial do desktop (Linux e macOS)** — entregue (9ª fatia da Fase 5): **matriz oficial de plataformas** (sistema, arquitetura, versão mínima, formato e canal) documentada e workflow `.github/workflows/desktop-release.yml` que gera **AppImage + `.deb`** (`ubuntu-22.04`) e **DMG universal** (`macos-latest`) em runners nativos, com **SHA-256** por artefato; ver checklist §2.44.
- Separação física de módulos que apresentem gargalo comprovado.

### Critério de saída

Cada integração possui consentimento, revogação, reconciliação, telemetria, tratamento de indisponibilidade e processo de suporte definidos.

## Fase 6 — produto comercial e infraestrutura gerenciada

### Objetivo

Transformar o sistema já funcional em produto comercializável: provedor **real** de Open Finance, hospedagem gerenciada na **nuvem Google**, **monetização** (gratuito + planos pagos) e publicação do desktop em **lojas**. Todas as frentes dependem de **decisões/credenciais externas** e **não alteram o núcleo já entregue** — reaproveitam os contratos, o domínio e o pipeline existentes.

### Possíveis entregas

- **Open Finance real** — substituir o stub de desenvolvimento por um provedor/agregador real (sob contrato regulado) atrás do **mesmo** `OpenFinanceProvider`, com **seleção por configuração** no lugar do binding fixo atual ([`open-finance.module.ts`](../apps/api/src/open-finance/open-finance.module.ts)); o consentimento, a sincronização incremental e a sync automática já estão prontos e passam a operar sem mudança de contrato. Depende de contrato e credenciais do agregador.
- **Hospedagem na nuvem Google** — provisionar a plataforma na **Google Cloud** (banco, cache e demais serviços gerenciados, gestão de segredos e rede), com pipeline de deploy e ambientes reproduzíveis; preserva a portabilidade já garantida pelos containers e pelo `docker-compose.staging.yml`.
- **Monetização** — versão gratuita + planos pagos: modelo de **planos e limites** (entitlements) no domínio e no banco, **cobrança** por provedor externo e telas de assinatura. Depende da escolha do provedor de cobrança.
- **Publicação em lojas** — empacotar e publicar o desktop na **Microsoft Store** (MSIX), **Mac App Store** (sandbox + entitlements) e **Snapcraft/Flatpak**, como canal adicional ao **download direto**; depende das contas de desenvolvedor e dos certificados de assinatura (ver [doc/08](./08-aplicativo-desktop.md#assinatura-de-release)).

### Critério de saída

Cada frente opera em produção com credenciais próprias: o Open Finance sincroniza com um agregador real sob consentimento; a plataforma roda na nuvem Google com deploy reproduzível; a monetização cobra e aplica limites por plano; e o desktop está publicado nas lojas com assinatura e atualização funcionando.

## Ordem recomendada dos primeiros fluxos

1. Autenticar e criar espaço financeiro.
2. Criar conta e categoria.
3. Registrar receita e despesa.
4. Transferir entre contas.
5. Exibir histórico e saldo.
6. Estornar e auditar.
7. Cadastrar cartão e fatura.
8. Registrar compra parcelada.
9. Criar recorrência e confirmar ocorrência.
10. Projetar saldo e criar orçamento.

Essa ordem valida primeiro as invariantes das quais as demais funcionalidades dependem.

## Backlog técnico contínuo

Em todas as fases:

- revisar ameaças e permissões;
- atualizar dependências em lotes pequenos;
- medir desempenho com dados representativos;
- testar backup e restauração;
- acompanhar acessibilidade;
- manter OpenAPI e documentação sincronizados;
- revisar custos de infraestrutura;
- registrar decisões arquiteturais relevantes;
- testar instalação, atualização, downgrade bloqueado e desinstalação do desktop em cada plataforma suportada;
- remover flags e caminhos temporários depois da estabilização.

## Próxima decisão recomendada

As perguntas de produto estão decididas (ver [status no índice](./README.md#status-de-validação-das-decisões)) e o roadmap até a Fase 5 está entregue. A **Fase 6** depende de **pré-requisitos externos** — contrato com o agregador de Open Finance, projeto na nuvem Google, provedor de cobrança e contas/certificados das lojas —, então a próxima decisão é **escolher qual dessas frentes abrir primeiro** e obter as credenciais correspondentes.

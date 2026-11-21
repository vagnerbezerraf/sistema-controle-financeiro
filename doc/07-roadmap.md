# Roadmap sugerido

## Estratégia

Entregar o produto em fatias verticais: cada etapa deve atravessar interface, API, dados, segurança, testes e operação. O objetivo não é construir todo o backend antes das interfaces, mas validar cedo os fluxos que podem revelar erros no domínio financeiro.

## Fase 0 — descoberta e fundação

### Objetivo

Eliminar ambiguidades de produto e preparar uma base pequena que possa ser entregue com segurança.

### Entregas

- Entrevistas e protótipo dos fluxos de registro, parcelamento, fatura e planejamento.
- Validação das decisões listadas no [índice](./README.md#decisões-que-precisam-de-validação-do-produto).
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
- Worker, outbox e fila: outbox transacional drenado pelo worker (retry/backoff/dead-letter) e jobs de **recorrências** (top-up do horizonte, reexecutável) e **lembretes de vencimento** (e-mail por membro com horário silencioso e idempotência diária); ver checklist §2.20 e §2.37.

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
- Modo offline completo.
- Distribuição oficial do desktop para sistemas operacionais ainda não cobertos.
- Separação física de módulos que apresentem gargalo comprovado.

### Critério de saída

Cada integração possui consentimento, revogação, reconciliação, telemetria, tratamento de indisponibilidade e processo de suporte definidos.

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

Antes de gerar código, transformar as perguntas abertas em decisões de produto e detalhar histórias da Fase 0 e da Fase 1 com critérios de aceite. O primeiro protótipo deve incluir também compra parcelada e fatura, mesmo que a implementação venha depois, porque esses fluxos influenciam o modelo de dados central.

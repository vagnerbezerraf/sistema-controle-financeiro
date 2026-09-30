# Segurança e requisitos não funcionais

## Segurança

### Identidade e sessão

- Usar OpenID Connect/OAuth com Authorization Code e PKCE.
- Exigir e-mail verificado para operações sensíveis.
- Oferecer autenticação multifator.
- Tokens de acesso com duração curta e rotação de refresh token.
- Tokens do mobile e desktop apenas no cofre seguro do sistema operacional por uma API de armazenamento apropriada.
- Cookies web `HttpOnly`, `Secure` e política `SameSite` apropriada quando usados.
- Revogar sessões após troca de credencial ou evento de risco.
- No desktop, abrir a autenticação no navegador padrão e validar estado, PKCE e retorno ao aplicativo.

### Autorização

- Toda consulta deve ser limitada ao espaço financeiro autorizado.
- Permissões verificadas no caso de uso, não apenas na interface.
- Princípio do menor privilégio para usuários, serviços e banco.
- Administração e suporte separados do acesso comum.
- Operações sensíveis exigem reautenticação quando apropriado.

### Proteção de dados

- TLS em todo tráfego externo e interno que atravesse rede não confiável.
- Criptografia em repouso para banco, backup e arquivos.
- Segredos em serviço próprio do ambiente, nunca em código ou arquivo versionado.
- Logs sem tokens, credenciais, descrições financeiras completas ou dados pessoais desnecessários.
- Upload com limite, tipo permitido, varredura e URL temporária.
- Desktop com Content Security Policy restritiva, conteúdo privilegiado apenas local e capacidades Tauri mínimas por janela.
- Instaladores e atualizações desktop assinados; rejeitar manifesto, pacote ou assinatura inválidos.
- Política de retenção para auditoria, arquivos, backups e telemetria.
- Revisão de dependências e imagens de contêiner no pipeline.

### Privacidade e LGPD

O desenho deve adotar minimização, finalidade e transparência. Antes da produção, é necessário documentar:

- dados coletados e base/finalidade de tratamento;
- operadores e subprocessadores;
- prazo de retenção;
- processo de acesso, correção, portabilidade e eliminação;
- tratamento de backups após solicitação de exclusão;
- resposta a incidentes;
- consentimentos específicos para integrações externas e notificações.

Este documento propõe controles técnicos, mas não substitui análise jurídica e de privacidade.

## Disponibilidade e desempenho

Metas iniciais sugeridas, sujeitas a validação de custo e uso:

| Indicador | Meta inicial |
|---|---|
| Disponibilidade mensal da API | 99,5% no MVP; revisar após tração |
| Leitura simples da API | p95 abaixo de 500 ms, sem contar rede do usuário |
| Comando financeiro simples | p95 abaixo de 800 ms |
| Dashboard mensal comum | p95 abaixo de 2 s |
| Registro rápido no mobile | confirmação visual imediata e resposta online em até 2 s na maioria dos casos |
| Inicialização do desktop | janela utilizável em até 3 s em equipamento de referência |
| Processamento de importação | progresso visível; não bloquear uma requisição longa |

Consultas devem ter paginação e limites. Exportações e relatórios grandes passam para o worker.

## Confiabilidade financeira

- Operações multi-registro usam transação de banco.
- Constraints duplicam invariantes críticas.
- Requisições financeiras são idempotentes.
- Horários de fechamento e recorrência consideram o fuso do espaço financeiro.
- Jobs podem ser reexecutados com segurança.
- Alterações retroativas têm auditoria e recalculam projeções afetadas.
- Testes baseados em propriedades verificam somas, transferências e distribuição de parcelas.
- Relatórios exibem data/hora da última atualização quando houver processamento assíncrono.

## Backup e recuperação

Proposta inicial:

- backup automatizado diário e recuperação para um ponto no tempo quando o provedor permitir;
- cópia protegida em local ou conta separada;
- criptografia e controle de acesso ao backup;
- teste de restauração pelo menos trimestral;
- runbook de recuperação com responsáveis e critérios de retorno;
- objetivo de ponto de recuperação (RPO) de até 24 horas no piloto e menor na produção madura;
- objetivo de tempo de recuperação (RTO) de até 8 horas no piloto e menor após validação operacional.

RPO e RTO finais devem ser aprovados pelo produto, pois afetam custo.

## Observabilidade

### Logs

- JSON estruturado.
- `correlation_id`, serviço, ambiente, versão e resultado.
- Níveis e retenção definidos.
- Mascaramento testado automaticamente.

### Métricas

- taxa, latência e erros por endpoint;
- conexões e consultas lentas no banco;
- atraso, tentativas e falhas da fila;
- sucesso de notificações e importações;
- logins suspeitos e bloqueios;
- métricas de negócio agregadas sem expor valores individuais.

### Rastreamento

- traces no backend e worker;
- propagação de contexto entre API, outbox e jobs;
- amostragem configurável;
- coleta de payload financeiro desabilitada.

## Qualidade e testes

### Pirâmide proposta

1. **Unidade:** regras de domínio, datas, parcelamento, arredondamento e projeção.
2. **Propriedades:** soma de parcelas, conservação em transferências e idempotência.
3. **Integração:** repositórios, migrações, transações e constraints usando PostgreSQL real em contêiner.
4. **Contrato:** OpenAPI, compatibilidade dos clientes gerados e erros.
5. **Ponta a ponta:** cadastro, despesa, transferência, parcelamento, fatura, orçamento e exportação.
6. **Desktop:** inicialização, autenticação, acesso a arquivo, atualização e permissões nativas em cada sistema suportado.
7. **Segurança:** autorização entre espaços, upload, rate limit e dependências.
8. **Recuperação:** restauração de backup e repetição de jobs.

### Barreiras da entrega

- formatação e lint;
- compilação TypeScript sem erros;
- testes unitários e de integração;
- migração validada em banco limpo e em cópia representativa;
- análise de dependências vulneráveis;
- comparação do contrato OpenAPI;
- testes E2E críticos;
- geração de artefatos reproduzíveis.

## Acessibilidade e usabilidade

- Alvo WCAG 2.2 nível AA na web.
- Navegação por teclado e foco visível.
- Leitores de tela e rótulos sem depender apenas de ícones.
- Contraste adequado e informação não comunicada somente por cor.
- Valores, datas e moedas formatados para o local do usuário.
- Gráficos acompanhados por resumo textual ou tabela.
- Áreas de toque adequadas no mobile.
- Atalhos documentados, ordem de foco previsível e operação completa por teclado no desktop.
- Fluxos críticos testados com fonte ampliada.

## Compatibilidade

- Web: versões modernas suportadas de Chrome, Edge, Firefox e Safari.
- Mobile: política explícita para versões mínimas de Android e iOS antes do primeiro release.
- Desktop: alvo técnico em Windows, macOS e Linux; a matriz de suporte oficial e versões mínimas será definida por fase. A proposta inicial é priorizar Windows e homologar macOS/Linux em seguida.
- Layout responsivo a partir de telas móveis até desktop.
- API mantém compatibilidade dentro da versão `/v1`; mudanças incompatíveis exigem estratégia de migração.

## Operação

Antes da produção devem existir runbooks para:

- indisponibilidade da API;
- banco sem conexão ou com alta latência;
- fila acumulada;
- falha de envio de notificação;
- migração malsucedida;
- restauração de backup;
- incidente de segurança;
- indisponibilidade do provedor de identidade;
- importação que criou dados incorretos.
- atualização desktop interrompida, inválida ou incompatível.

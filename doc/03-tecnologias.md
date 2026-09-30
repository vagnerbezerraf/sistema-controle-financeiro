# Tecnologias propostas

## Diretriz de escolha

A base prioriza produtividade, ecossistema maduro, tipagem forte, portabilidade e uma única linguagem principal. As versões exatas deverão ser fixadas no início da implementação usando releases estáveis e suportadas; a documentação evita congelar números que envelhecem rapidamente.

## Stack principal

| Área | Tecnologia proposta | Motivo |
|---|---|---|
| Linguagens | TypeScript em modo estrito; Rust somente no núcleo desktop | Reduz divergências entre clientes e backend, mantendo a integração nativa pequena e segura |
| Monorepo | pnpm workspaces + Turborepo | Compartilhamento controlado de contratos, configurações e design tokens |
| Web | React + Next.js com App Router | Bom ecossistema, roteamento, renderização híbrida e implantação flexível |
| Mobile | React Native + Expo + Expo Router | Uma base para Android e iOS, com acesso gradual a recursos nativos |
| Desktop | Tauri 2 + React + Vite | Aplicação leve para Windows, macOS e Linux, com acesso nativo controlado |
| API | Node.js LTS + NestJS | Organização modular, injeção de dependências, validação e integração com OpenAPI |
| Contrato | REST + OpenAPI | Contrato legível, geração de clientes e testes de compatibilidade |
| Banco | PostgreSQL | Transações ACID, constraints, índices e recursos maduros para dados financeiros |
| ORM e migrações | Prisma ORM | Tipagem, migrações versionadas e acesso consistente ao PostgreSQL |
| Validação | Zod nos limites de cliente; validação do NestJS na API | Mensagens rápidas no cliente sem retirar a autoridade do backend |
| Autenticação | OpenID Connect/OAuth com PKCE | Fluxo padrão para web, mobile e desktop; evita criar um protocolo próprio |
| Cache e filas | Redis + BullMQ, apenas quando necessário | Tarefas agendadas e assíncronas com retentativa controlada |
| Arquivos | Armazenamento compatível com S3 | Comprovantes e exportações sem sobrecarregar o banco |
| Observabilidade | OpenTelemetry + backend compatível com OTLP | Logs, métricas e traces sem forte dependência de fornecedor |
| Testes | Vitest, Supertest, Testcontainers e Playwright | Cobertura unitária, integração real e fluxos web de ponta a ponta |
| Qualidade | ESLint, Prettier e análise de dependências | Padrão consistente e prevenção de importações entre módulos proibidos |
| Entrega | Contêineres OCI + pipeline de CI/CD | Paridade entre ambientes e implantação reproduzível |

## Web

O Next.js será usado como camada de apresentação. Operações financeiras continuarão passando pela API NestJS, inclusive quando a página for renderizada no servidor. Isso evita manter duas regras de negócio e preserva o mesmo contrato para web, mobile e desktop.

Diretrizes:

- App Router e TypeScript estrito;
- componentes acessíveis e responsivos;
- biblioteca visual pequena, baseada em design tokens;
- TanStack Query para estado remoto e cache de requisições quando necessário;
- estado local simples; evitar uma store global antes de existir demanda;
- formulários com validação imediata, repetida de forma autoritativa pela API;
- Playwright nos fluxos críticos.

A documentação oficial recomenda o App Router para os recursos mais recentes, e o framework suporta implantação como servidor Node.js, contêiner ou exportação estática com limitações: [App Router](https://nextjs.org/docs/app) e [opções de implantação](https://nextjs.org/docs/app/getting-started/deploying).

## Mobile

Expo e React Native permitem atender Android e iOS sem duas equipes nativas desde o início. O aplicativo ainda deve respeitar convenções de cada plataforma e pode adotar módulos nativos quando uma necessidade real surgir.

Diretrizes:

- Expo Router para navegação;
- armazenamento seguro do sistema operacional para tokens;
- banco/cache local somente para experiência e operação offline controlada;
- sincronização com identificadores gerados no cliente e idempotência na API;
- notificações push com preferências explícitas;
- atualizações e builds assinados por ambiente;
- acessibilidade testada em Android e iOS.

A documentação do Expo descreve o framework como base para aplicativos Android e iOS e recomenda Node.js LTS: [criação de projeto Expo](https://docs.expo.dev/get-started/create-a-project/).

## Desktop

O desktop será uma aplicação Tauri 2 com interface React/TypeScript construída por Vite. Tauri utiliza a WebView do sistema operacional e uma camada nativa em Rust, permitindo instaladores menores que abordagens que empacotam um navegador completo.

Diretrizes:

- um cliente próprio em `apps/desktop`, sem executar o servidor Next.js dentro da aplicação;
- compartilhamento de contratos OpenAPI, design tokens e componentes realmente portáveis;
- camada Rust sem regras financeiras e com comandos nativos mínimos;
- capacidades Tauri concedidas por janela e por plataforma com menor privilégio;
- armazenamento de tokens no cofre seguro do sistema operacional;
- autenticação pelo navegador padrão com Authorization Code + PKCE e retorno validado ao aplicativo;
- acesso a arquivos apenas após escolha explícita do usuário;
- instaladores assinados e atualizações automáticas verificadas criptograficamente;
- builds e testes executados em cada sistema operacional suportado.

O Tauri 2 aceita frontends web e tem suporte multiplataforma. Sua documentação também descreve distribuição e assinatura para Windows, macOS e Linux: [visão geral do Tauri](https://v2.tauri.app/start/) e [distribuição](https://v2.tauri.app/distribute/).

O uso de Tauri adiciona Rust e dependências de compilação específicas de cada sistema. Esse custo é aceito para obter uma camada nativa menor e uma política explícita de capacidades. O escopo completo está em [Aplicativo desktop](./08-aplicativo-desktop.md).

## Backend

O NestJS será organizado por módulos de domínio, e não por uma única pasta global de controllers, services e repositories.

Cada módulo deverá conter, conforme necessário:

```text
module-name/
  domain/           Entidades, valores, regras e eventos
  application/      Casos de uso e portas
  infrastructure/   Persistência e integrações
  http/             Controllers e DTOs
```

Diretrizes:

- controllers finos;
- casos de uso explícitos;
- transações controladas na camada de aplicação;
- entidades do domínio sem dependência do framework;
- repositórios definidos por interface quando isso facilitar testes e limites;
- nenhum cálculo financeiro crítico apenas no cliente;
- OpenAPI gerado e verificado em CI.

O NestJS possui integração oficial para gerar documentos OpenAPI a partir da aplicação: [OpenAPI no NestJS](https://docs.nestjs.com/openapi/introduction).

## Banco e persistência

PostgreSQL deve usar constraints para proteger invariantes que também são verificadas pela aplicação:

- valores obrigatórios e positivos quando aplicável;
- códigos de moeda válidos;
- unicidade dentro do espaço financeiro;
- chaves estrangeiras;
- versões para concorrência otimista;
- índices compostos por espaço financeiro, conta, data e situação;
- transações para operações que alteram mais de um registro financeiro.

Na data desta proposta, a documentação oficial identifica PostgreSQL 18 como versão corrente e 17/16 como suportadas. A implantação deve escolher uma versão suportada pelo provedor e definir política de atualização: [documentação atual do PostgreSQL](https://www.postgresql.org/docs/current/).

## Autenticação e autorização

A aplicação deve integrar-se a um provedor compatível com OpenID Connect. A escolha concreta pode ser um serviço gerenciado ou uma instalação própria, desde que suporte:

- Authorization Code com PKCE;
- autenticação multifator;
- recuperação e verificação de conta;
- revogação de sessão;
- rotação segura de chaves;
- integração com web, aplicativos móveis e desktop.

A autorização de acesso aos dados financeiros permanece na API. Um token válido não dá acesso automático a qualquer espaço financeiro; a participação e o papel do usuário devem ser conferidos em cada operação.

## Observabilidade

O backend deve emitir logs estruturados com identificador de correlação, métricas de negócio seguras e rastreamento distribuído. Dados financeiros, tokens e informações pessoais não devem aparecer em logs.

OpenTelemetry para JavaScript oferece traces e métricas estáveis em Node.js e exportação via OTLP: [documentação JavaScript](https://opentelemetry.io/docs/languages/js/) e [exportadores](https://opentelemetry.io/docs/languages/js/exporters/).

## Política de versões

- Node.js: versão LTS ativa ou de manutenção suportada por todas as ferramentas.
- Frameworks: release estável; evitar versões beta no produto financeiro.
- PostgreSQL: versão suportada pelo projeto e pelo provedor.
- Dependências: atualização automatizada em lotes pequenos, com testes e revisão.
- Imagens de contêiner: fixadas por versão e digest nas entregas de produção.
- Contrato OpenAPI: versionado no repositório e comparado contra mudanças incompatíveis.

## Alternativas consideradas

### Flutter

É uma alternativa forte para mobile, mas TypeScript/React permite maior reaproveitamento de conhecimento, contratos e ferramentas com a web. A decisão deve mudar se a equipe já dominar Dart/Flutter ou exigir uma camada visual altamente uniforme.

### Electron

Electron permitiria manter praticamente toda a camada desktop em JavaScript/TypeScript e oferece um ecossistema muito maduro. Tauri foi preferido por usar a WebView do sistema, produzir pacotes menores e oferecer capacidades nativas explícitas. Electron deve ser reconsiderado se uma dependência exigir APIs específicas do Chromium/Node ou se a equipe não puder manter a pequena camada Rust e a matriz de compilação nativa.

### .NET ou Java no backend

São excelentes escolhas, especialmente para equipes com experiência nessas plataformas. NestJS foi proposto para reduzir o número de linguagens. Se a equipe tiver domínio significativamente maior de .NET ou Java, produtividade e operação podem justificar a troca sem alterar a arquitetura lógica.

### Microserviços

Não foram escolhidos para o início por adicionarem rede, observabilidade distribuída, consistência eventual e operação de múltiplas implantações antes de existir escala que compense esses custos.

### Backend serverless por função

Pode servir a tarefas específicas, mas fluxos financeiros transacionais, migrações e jobs agendados ficam mais previsíveis em uma API e worker de longa duração. A implantação em contêiner também reduz dependência de fornecedor.

# Aplicativo desktop

## Objetivo

Oferecer uma versão instalada do sistema de controle financeiro, adequada ao uso prolongado em computador e integrada de forma segura ao sistema operacional. O desktop não será apenas um atalho para o site: terá navegação por teclado, importação e exportação nativas, notificações locais e ciclo próprio de instalação e atualização.

## Decisão técnica

Adotar **Tauri 2 + React + TypeScript + Vite**.

- React/TypeScript implementa a interface.
- Vite gera os ativos locais carregados na WebView.
- Tauri gerencia janela, ciclo de vida, capacidades, instalador e atualização.
- Rust implementa apenas comandos que precisam acessar recursos nativos.
- A API NestJS continua sendo a autoridade de autenticação, autorização, regras financeiras e persistência.

A aplicação desktop não executará o servidor Next.js e não acessará diretamente o PostgreSQL. Isso evita uma segunda arquitetura de backend dentro do computador e mantém o contrato consistente entre todos os clientes.

## Plataformas

O alvo técnico é:

- Windows;
- macOS;
- Linux.

Para controlar custo de testes, assinatura e suporte, a liberação pode ser escalonada. A proposta inicial é lançar primeiro para Windows, coerente com o ambiente atual do projeto, e homologar macOS e distribuições Linux selecionadas em seguida. Essa ordem é uma premissa e precisa de aprovação de produto.

“Compatível com Tauri” não significa automaticamente “suportado pelo produto”. A matriz oficial deverá indicar sistema, arquitetura, versão mínima, formato do instalador e canal de suporte.

## Arquitetura

```mermaid
flowchart LR
    U["Usuário"] --> UI["React / TypeScript"]
    UI --> API["API REST /v1"]
    UI --> IPC["Comandos Tauri autorizados"]
    IPC --> CORE["Núcleo Rust mínimo"]
    CORE --> FILES["Arquivos escolhidos pelo usuário"]
    CORE --> VAULT["Cofre de credenciais do SO"]
    CORE --> NOTIF["Notificações do SO"]
    CORE --> UPDATE["Atualizador assinado"]
    API --> BACK["Backend e PostgreSQL"]
```

### Limites

- A interface não chama comandos nativos genéricos de shell.
- O núcleo Rust não calcula saldo, parcela, fatura ou orçamento.
- O desktop não recebe credencial do banco.
- Arquivos só são lidos ou gravados após ação explícita do usuário.
- Conteúdo remoto não é carregado dentro de uma WebView com capacidades privilegiadas.
- Toda gravação financeira usa a API e chave de idempotência.

## Compartilhamento de código

O desktop pode compartilhar:

- cliente gerado pelo contrato OpenAPI;
- tipos e schemas de entrada sem regra de domínio;
- design tokens, ícones e formatação;
- componentes React que não dependam de Next.js nem de APIs específicas do navegador;
- telemetria e tratamento padronizado de erros.

Não deve compartilhar automaticamente:

- Server Components, Server Actions ou roteamento do Next.js;
- componentes móveis React Native;
- regras financeiras autoritativas;
- código que pressuponha acesso irrestrito ao sistema de arquivos;
- armazenamento de sessão entre processos ou plataformas.

A extração de um pacote de componentes só deve ocorrer quando houver reutilização real. Duplicar uma pequena composição visual pode ser mais seguro do que criar uma abstração inadequada.

## Experiência proposta

### Navegação

- menu lateral para dashboard, lançamentos, contas, cartões, planejamento e relatórios;
- atalhos para novo lançamento, pesquisa, troca de período e importação;
- foco visível e ordem de tabulação previsível;
- restauração segura de tamanho e posição da janela;
- confirmação antes de fechar quando existir trabalho local não enviado.

### Recursos locais

- seletor nativo para importar CSV/OFX;
- seletor de pasta ou arquivo para exportações;
- notificações de vencimento, orçamento e atualização;
- integração opcional com bandeja do sistema após validação;
- abertura de links externos no navegador padrão;
- cache de leitura protegido, se necessário.

### Paridade

O MVP desktop deve cobrir os mesmos fluxos financeiros essenciais da web. Recursos locais aprimoram o fluxo, mas não criam entidades exclusivas que impeçam o uso da conta por outro cliente.

## Autenticação

Fluxo recomendado:

1. O desktop gera `state`, verificador PKCE e desafio.
2. Abre a autorização no navegador padrão.
3. O provedor autentica o usuário.
4. O retorno chega por URI registrada ou servidor local temporário estritamente limitado.
5. O aplicativo valida `state` e troca o código usando PKCE.
6. O token de renovação é armazenado no cofre seguro do sistema operacional.

Não se deve embutir formulário de senha na WebView nem persistir tokens em `localStorage`, arquivo texto, log ou configuração comum.

## Segurança nativa

- Content Security Policy sem `unsafe-eval` e com destinos de rede restritos.
- Capacidades Tauri separadas por janela e plataforma.
- Plugins oficiais ou revisados, em quantidade mínima.
- Sem comando genérico para executar processos.
- URLs externas permitidas por lista explícita.
- Assinatura de código e, no macOS, notarização.
- Manifesto e pacote de atualização assinados.
- Segredos de assinatura apenas no ambiente protegido de CI/CD.
- Dependências Rust e JavaScript verificadas e atualizadas.
- Telemetria sem valores, descrições ou documentos financeiros.

O modelo de capacidades do Tauri permite limitar permissões a janelas, comandos e plataformas. A documentação recomenda conceder apenas as capacidades necessárias: [conceitos de segurança e capacidades](https://v2.tauri.app/concept/).

## Atualização e distribuição

### Canais

- `development`: execução local sem dados de produção;
- `beta`: validação interna ou por grupo controlado;
- `stable`: produção.

Uma instalação não troca de canal silenciosamente. O número de versão deve seguir uma política única e aparecer na interface e nos logs técnicos.

### Artefatos

- Windows: instalador MSI ou NSIS, conforme validação operacional.
- macOS: DMG ou App Store, com assinatura e notarização.
- Linux: iniciar com um ou dois formatos definidos, como AppImage e pacote Debian, evitando prometer suporte a todas as distribuições.

Tauri fornece empacotamento por plataforma e documenta a exigência de assinatura na maioria dos canais: [distribuição do Tauri](https://v2.tauri.app/distribute/). No Windows, são suportados instaladores MSI e NSIS: [instalador Windows](https://v2.tauri.app/distribute/windows-installer/).

### Política de atualização

- consultar atualizações por HTTPS;
- verificar assinatura antes de instalar;
- exibir versão, tamanho e notas relevantes;
- permitir adiar atualização não crítica;
- exigir atualização quando a versão da API deixar de ser compatível, com mensagem clara;
- preservar dados locais compatíveis e ter recuperação para falha de instalação;
- impedir downgrade não autorizado que reintroduza vulnerabilidade ou esquema local incompatível.

## Online e offline

### MVP

O desktop é online-first. Pode manter cache de consultas recentes, mas deve indicar quando os dados estão desatualizados. Comandos financeiros sem conexão não são confirmados como concluídos.

### Evolução offline

Um modo offline completo exigirá:

- armazenamento local criptografado;
- identificadores gerados no cliente;
- fila persistente e idempotente;
- estados visíveis de pendência, falha e conflito;
- política de resolução por entidade;
- migração do banco local;
- limpeza remota/local após revogação de sessão;
- testes de perda de conexão em cada etapa.

Esse trabalho deve ser planejado como funcionalidade própria, não tratado como simples cache.

## Pipeline e testes

Cada plataforma oficialmente suportada deve ter um job executado no próprio sistema operacional para:

1. instalar dependências JavaScript, Rust e do sistema;
2. compilar o frontend e o núcleo Tauri;
3. executar testes unitários e de integração;
4. gerar o instalador;
5. assinar e, quando aplicável, notarizar;
6. publicar no canal correto;
7. executar smoke test de instalação, abertura, login e atualização.

Também devem ser testados:

- instalação limpa e sobre versão anterior;
- execução como usuário sem privilégio administrativo;
- URL de retorno da autenticação;
- permissões de arquivo negadas e concedidas;
- pacote de atualização adulterado ou incompatível;
- perda de rede durante uma operação;
- múltiplas janelas ou segunda instância, caso sejam habilitadas;
- desinstalação e política de limpeza do cache local.

## Critérios de aceite do primeiro release desktop

1. Instalação assinada no sistema operacional inicial.
2. Login e logout sem armazenar token em local inseguro.
3. Fluxos essenciais de contas, lançamentos, transferências, parcelas, faturas, orçamento e planejamento.
4. Importação e exportação usando seletores nativos.
5. Operação completa por teclado nos fluxos críticos.
6. Dados iguais aos apresentados pela web e pelo mobile após sincronização.
7. Atualização válida instalada e atualização adulterada rejeitada.
8. Nenhuma capacidade nativa além das documentadas.
9. Logs e relatórios de erro sem dados financeiros sensíveis.
10. Matriz de sistema operacional, versão e arquitetura publicada.

## Decisões pendentes

- Confirmar o primeiro sistema operacional e as arquiteturas suportadas.
- Escolher loja, download direto ou ambos por plataforma.
- Definir se atualização será automática, assistida ou obrigatória em correções críticas.
- Definir o nível de operação offline necessário.
- Confirmar se bandeja do sistema, múltiplas janelas e inicialização automática entregam valor real.
- Definir certificados, titularidade, rotação e processo de assinatura.

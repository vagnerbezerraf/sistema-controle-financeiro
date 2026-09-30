# Sistema de Controle Financeiro — documentação

> Status: **Implementação em andamento**  
> Fase do roadmap: **Fase 0 (Fundação e scaffold) em ~80% concluída**  
> Última atualização: 30 de setembro de 2026  
> Referência do status real da implementação: **[doc/09-estado-atual-e-checklist.md](./09-estado-atual-e-checklist.md)** — LEIA PRIMEIRO se for retomar o projeto após um período parado.

Este diretório reúne **a visão inicial do produto** (proposta de 13 de agosto de 2026, que serviu de base ao scaffolding) **mais o estado real da implementação atual** com o checklist de conclusão por fase, itens missing e lições aprendidas já aplicadas.

- **Documentos de planejamento/produto** (arquitetura proposta, tecnologias, modelo de domínio, segurança, roadmap): os 8 primeiros documentos abaixo, gerados antes do início do código.
- **Documento de estado real da implementação**: o 9º arquivo abaixo, **que descreve o que já está feito hoje, o que falta, próximos passos e lições de erros já resolvidos**.

## Documentos

1. [Visão do produto](./01-visao-do-produto.md)
2. [Arquitetura proposta](./02-arquitetura.md)
3. [Tecnologias](./03-tecnologias.md)
4. [Funcionalidades](./04-funcionalidades.md)
5. [Modelo de domínio e dados](./05-modelo-de-dominio.md)
6. [Segurança e requisitos não funcionais](./06-requisitos-nao-funcionais.md)
7. [Roadmap sugerido](./07-roadmap.md)
8. [Aplicativo desktop](./08-aplicativo-desktop.md)
9. **[Estado atual, checklist e próximos passos](./09-estado-atual-e-checklist.md)** ⬅️ **leia primeiro se está retomando o projeto.**

## Resumo da proposta

- Aplicações independentes para web, mobile e desktop, atendidas pela mesma API.
- Monólito modular no backend: uma implantação simples, com limites internos claros entre os domínios.
- PostgreSQL como fonte oficial dos dados financeiros.
- API REST versionada e documentada com OpenAPI.
- Valores monetários armazenados em tipo decimal; nunca em ponto flutuante.
- Separação entre previsão financeira, obrigação e movimentação efetivada.
- Segurança, privacidade, auditoria, backup e observabilidade desde a primeira versão utilizável.
- Evolução para filas, integrações bancárias ou serviços independentes apenas quando houver demanda comprovada.

## Premissas adotadas

- A moeda inicial será o real brasileiro (BRL), deixando a estrutura preparada para múltiplas moedas no futuro.
- Uma pessoa poderá manter um espaço financeiro individual e, futuramente, compartilhar espaços com familiares.
- O primeiro lançamento será manual; importação de arquivos virá antes de integrações bancárias automáticas.
- O produto deverá funcionar bem para orçamento doméstico e finanças pessoais, sem pretensão inicial de substituir um sistema contábil empresarial.
- Web, mobile e desktop compartilharão contratos, regras de validação e identidade visual, mas não serão obrigados a compartilhar toda a implementação de interface.
- O cliente desktop será construído com Tauri 2 e React/TypeScript; Rust ficará restrito à integração nativa necessária.
- Windows, macOS e Linux são alvos técnicos, mas a ordem de suporte oficial pode ser escalonada por plataforma.

## Decisões que precisam de validação do produto

Antes da implementação, convém confirmar:

1. O sistema será somente pessoal ou permitirá finanças familiares desde o MVP?
2. Cartão de crédito e fatura entram no primeiro lançamento?
3. Haverá versão gratuita e planos pagos?
4. O sistema será hospedado em nuvem pública, infraestrutura própria ou ambos?
5. Importação bancária por CSV/OFX e integração com Open Finance são prioridades de qual fase?
6. Comprovantes serão armazenados já no MVP?
7. O produto precisará operar sem internet nos aplicativos móvel e desktop?
8. Qual sistema operacional desktop deve ser lançado primeiro: Windows, macOS ou Linux?
9. O desktop será distribuído por lojas, download direto ou ambos?

Essas respostas alteram escopo, custo, modelo de dados e requisitos de segurança.

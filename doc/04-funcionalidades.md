# Funcionalidades

## Convenções

Prioridades usadas neste documento:

- **MVP:** necessário para a primeira versão utilizável.
- **Próxima:** evolução natural após estabilizar o MVP.
- **Futura:** depende de validação, escala ou integração externa.

## Identidade e espaços financeiros

### MVP

- Criar conta, entrar, sair e recuperar acesso.
- Verificar e-mail e habilitar segundo fator quando o provedor oferecer.
- Criar um espaço financeiro individual.
- Editar perfil, fuso horário, moeda principal e preferências.
- Exportar os próprios dados e solicitar exclusão da conta.

### Próxima

- Criar espaço familiar.
- Convidar membros.
- Papéis de proprietário, administrador, colaborador e somente leitura.
- Definir se um item é compartilhado ou privado quando o modelo do produto permitir.

## Contas, carteiras e cartões

### MVP

- Cadastrar conta corrente, poupança, dinheiro e outras carteiras.
- Informar saldo inicial e data de referência.
- Arquivar conta sem perder histórico.
- Cadastrar cartão de crédito, limite, dia de fechamento e vencimento.
- Acompanhar fatura aberta, fechada, paga, vencida ou cancelada.
- Registrar pagamento de fatura como transferência, sem duplicar a despesa.

### Próxima

- Contas de investimento como visão consolidada, sem execução de ordens.
- Múltiplas moedas e taxas de conversão registradas.
- Contas compartilhadas e permissões específicas.

## Lançamentos

### MVP

- Registrar receita, despesa, transferência e ajuste.
- Informar descrição, valor, data, conta, categoria, observação e etiquetas.
- Marcar como previsto, pendente, efetivado ou cancelado conforme o tipo.
- Editar e excluir com política de auditoria.
- Duplicar um lançamento.
- Pesquisar e filtrar por período, conta, categoria, etiqueta, tipo e situação.
- Anexar comprovante quando o armazenamento de arquivos estiver habilitado.
- Estornar sem apagar a movimentação original.

### Regras essenciais

- Transferência movimenta duas contas e não entra nos totais de receita/despesa.
- Valor efetivado altera saldo realizado; valor previsto altera apenas projeção.
- Exclusões relevantes devem ser lógicas ou produzir trilha de auditoria.
- Reenvio da mesma operação não pode criar duplicidade.

## Categorias e etiquetas

### MVP

- Categorias padrão editáveis.
- Categorias de receita e despesa.
- Subcategorias em um nível inicial.
- Cor e ícone.
- Etiquetas livres para análises transversais.
- Arquivamento sem remover o histórico.

### Próxima

- Regras automáticas de categorização por descrição, origem e conta.
- Divisão de um lançamento entre várias categorias.

## Compras parceladas

### MVP

- Registrar valor total, número de parcelas, primeira data e meio de pagamento.
- Exibir número da parcela, por exemplo `3/12`.
- Distribuir diferenças de centavos sem alterar o total da compra.
- Associar parcelas de cartão às faturas correspondentes.
- Antecipar, cancelar ou estornar parcelas com histórico.
- Editar somente uma parcela ou as parcelas futuras quando a regra permitir.
- Mostrar impacto mensal futuro.

## Recorrências e contas a pagar/receber

### MVP

- Criar recorrência diária, semanal, mensal e anual.
- Definir data inicial, final ou quantidade de ocorrências.
- Gerar ocorrências futuras em janela limitada.
- Confirmar uma ocorrência como lançamento realizado.
- Alterar somente esta ocorrência ou a série futura.
- Pausar e encerrar uma recorrência.
- Alertar antes do vencimento.

### Próxima

- Regras personalizadas, como último dia útil ou múltiplos dias no mês.
- Reajuste de valor programado.
- Conciliação automática com itens importados.

## Orçamentos

### MVP

- Definir limite mensal geral ou por categoria.
- Comparar gasto realizado e comprometido com o limite.
- Mostrar percentual consumido e valor restante.
- Alertar em faixas configuráveis, por exemplo 80% e 100%.
- Copiar orçamento para o mês seguinte.

### Próxima

- Orçamento com rollover de saldo.
- Métodos por envelopes.
- Limites semanais e anuais.
- Cenários otimista, provável e conservador.

## Planejamento e metas

### MVP

- Criar compromisso futuro sem afetar saldo realizado.
- Calendário de receitas, despesas, parcelas e faturas.
- Projetar saldo diário e mensal.
- Criar meta com nome, valor-alvo e prazo.
- Registrar contribuições e acompanhar progresso.
- Simular contribuição mensal necessária.

### Próxima

- Planejamentos de longo prazo com marcos.
- Reserva de emergência calculada por meses de despesa.
- Cenários alternativos sem alterar o plano oficial.
- Priorização de metas concorrentes.

## Dashboard e relatórios

### MVP

- Saldo total e por conta.
- Receitas e despesas do período.
- Evolução mensal.
- Gastos por categoria.
- Próximos vencimentos.
- Faturas abertas e limite disponível.
- Orçamento consumido.
- Saldo projetado.
- Filtros por espaço, conta e período.

### Próxima

- Comparação com período anterior.
- Patrimônio líquido.
- Taxa de poupança.
- Tendências e anomalias com explicação verificável.
- Relatórios salvos e agendados.

## Importação, exportação e conciliação

### MVP

- Exportar lançamentos e cadastros em formato aberto.
- Importar CSV com prévia e mapeamento de colunas.
- Detectar duplicidades antes de confirmar.
- Mostrar erros por linha sem perder todo o lote.
- Desfazer uma importação quando não houver alterações posteriores incompatíveis.

### Próxima

- Importar OFX.
- Memorizar mapeamentos por instituição.
- Conciliar lançamento previsto com item importado.
- Histórico e auditoria de lotes.

### Futura

- Integração consentida com agregadores e Open Finance.
- Renovação e revogação visível de consentimentos.
- Sincronização incremental e tratamento de indisponibilidade do provedor.

## Notificações

### MVP

- Próximo vencimento.
- Fatura próxima do vencimento.
- Orçamento perto do limite.
- Saldo projetado negativo.
- Preferências por tipo e canal.
- Horário silencioso.

### Próxima

- Resumo semanal e mensal.
- Detecção de lançamento incomum.
- Lembrete de recorrência ainda não confirmada.

## Administração e suporte

### MVP

- Estado de saúde da aplicação sem expor dados.
- Consulta de eventos técnicos por identificador de correlação.
- Ferramentas administrativas com acesso separado e auditado.
- Gestão de categorias padrão e modelos de importação.

Ferramentas de suporte não devem permitir que operadores vejam dados financeiros completos por padrão.

## Experiência desktop

### MVP

- Instalação e execução em pelo menos o sistema operacional definido como alvo inicial.
- Autenticação segura pelo navegador padrão.
- Acesso aos mesmos fluxos financeiros essenciais da web.
- Layout adaptado a janelas redimensionáveis e telas grandes.
- Navegação completa por teclado e atalhos para ações frequentes.
- Seleção nativa de arquivos para importação e exportação.
- Notificações do sistema conforme as preferências do usuário.
- Atualização assinada, com versão e canal visíveis.
- Bloqueio local opcional após período de inatividade.

### Próxima

- Suporte oficial aos demais sistemas operacionais previstos.
- Arrastar e soltar arquivos de importação.
- Ações rápidas pela bandeja do sistema, se validadas por uso.
- Cache local protegido para consultas recentes.
- Modo offline com fila explícita de operações e resolução de conflitos.

O desktop não terá acesso direto ao banco de dados nem uma implementação paralela das regras financeiras.

## Experiência offline

No MVP, a leitura de dados recentemente acessados no mobile ou desktop pode funcionar com cache, mas operações financeiras exigirão conexão ou uma fila local claramente sinalizada. Um modo offline completo é uma fase própria, pois exige resolução de conflitos, criptografia local, sincronização idempotente e testes adicionais.

## Critérios de conclusão do MVP funcional

O MVP estará funcionalmente completo quando uma pessoa puder:

1. Criar sua conta e seu espaço financeiro.
2. Cadastrar contas e cartão.
3. Registrar receitas, despesas, transferências, recorrências e parcelamentos.
4. Visualizar saldo realizado e projetado sem divergência.
5. Criar orçamento e meta.
6. Consultar dashboard, calendário e fatura.
7. Receber alertas essenciais.
8. Exportar seus dados.
9. Usar os fluxos críticos na web, no mobile e no desktop suportado pelo MVP.

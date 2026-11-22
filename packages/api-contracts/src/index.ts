import { CurrencyCode, MoneyAmount, IsoDate, UuidSchema } from '@scf/validation';

export interface HealthResponse {
  status: 'ok' | 'degraded';
  version: string;
  timestamp: string;
  services?: Record<string, 'ok' | 'degraded' | 'unknown'>;
}

export interface UserProfile {
  id: string;
  email: string;
  name?: string;
  timezone: string;
  locale: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserRequest {
  email: string;
  name?: string;
  password?: string;
  timezone?: string;
  locale?: string;
}

export type FinancialSpaceRole = 'owner' | 'admin' | 'contributor' | 'viewer';

export interface FinancialSpace {
  id: string;
  name: string;
  primaryCurrency: CurrencyCode;
  timezone: string;
  state: 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
  userRole?: FinancialSpaceRole;
}

export interface CreateFinancialSpaceRequest {
  name: string;
  primaryCurrency?: CurrencyCode;
  timezone?: string;
}

export interface UpdateFinancialSpaceRequest {
  name?: string;
  primaryCurrency?: CurrencyCode;
  timezone?: string;
  state?: 'active' | 'archived';
}

export interface SpaceMember {
  id: string;
  userId: string;
  email: string;
  name: string | null;
  role: FinancialSpaceRole;
  status: 'active' | 'invited' | 'revoked';
  joinedAt: string | null;
}

export type SpaceInviteStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

export interface SpaceInvite {
  id: string;
  email: string;
  role: FinancialSpaceRole;
  status: SpaceInviteStatus;
  expiresAt: string;
  createdAt: string;
}

export interface CreateSpaceInviteRequest {
  email: string;
  role: FinancialSpaceRole;
}

export interface CreateSpaceInviteResponse {
  invite: SpaceInvite;
  token: string;
  acceptUrl: string;
}

export interface AcceptSpaceInviteRequest {
  token: string;
}

export interface AcceptSpaceInviteResponse {
  spaceId: string;
  financialSpaceName: string;
  role: FinancialSpaceRole;
}

export interface UpdateMemberRoleRequest {
  role: FinancialSpaceRole;
}

export type AccountType = 'checking' | 'savings' | 'cash' | 'wallet' | 'credit_card' | 'investment';

export interface Account {
  id: string;
  financialSpaceId: string;
  name: string;
  type: AccountType;
  currency: CurrencyCode;
  initialBalance: MoneyAmount;
  initialBalanceDate: IsoDate;
  institution?: string;
  branch?: string;
  number?: string;
  color?: string;
  icon?: string;
  state: 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
}

export interface CreateAccountRequest {
  name: string;
  type: AccountType;
  currency?: CurrencyCode;
  initialBalance?: MoneyAmount;
  initialBalanceDate?: IsoDate;
  institution?: string;
  branch?: string;
  number?: string;
  color?: string;
  icon?: string;
}

export interface UpdateAccountRequest {
  name?: string;
  institution?: string;
  branch?: string;
  number?: string;
  color?: string;
  icon?: string;
  state?: 'active' | 'archived';
}

/**
 * Taxa de cambio de `fromCurrency` para `toCurrency`, vigente a partir de
 * `asOf` (inclusive) ate ser substituida por uma taxa mais recente do mesmo par.
 */
export interface ExchangeRate {
  id: string;
  financialSpaceId: string;
  fromCurrency: CurrencyCode;
  toCurrency: CurrencyCode;
  /** Quantas unidades de `toCurrency` valem 1 unidade de `fromCurrency`. */
  rate: MoneyAmount;
  asOf: IsoDate;
  /** Origem informada pelo usuario (ex.: banco central); livre. */
  source?: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface CreateExchangeRateRequest {
  fromCurrency: CurrencyCode;
  toCurrency: CurrencyCode;
  rate: MoneyAmount;
  asOf?: IsoDate;
  source?: string;
}

export interface UpdateExchangeRateRequest {
  rate?: MoneyAmount;
  asOf?: IsoDate;
  source?: string;
  version?: number;
}

export type CategoryType = 'income' | 'expense' | 'both';

export interface Category {
  id: string;
  financialSpaceId: string;
  name: string;
  type: CategoryType;
  color?: string;
  icon?: string;
  parentId?: string;
  state: 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
}

export interface CreateCategoryRequest {
  name: string;
  type: CategoryType;
  color?: string;
  icon?: string;
  parentId?: string;
}

export type TransactionType = 'income' | 'expense' | 'transfer' | 'adjustment';
export type TransactionStatus = 'scheduled' | 'pending' | 'confirmed' | 'canceled';

export interface Posting {
  id: string;
  accountId: string;
  amount: MoneyAmount;
  direction: 'debit' | 'credit';
  effectiveDate: IsoDate;
}

export interface Transaction {
  id: string;
  financialSpaceId: string;
  type: TransactionType;
  status: TransactionStatus;
  description: string;
  notes?: string;
  categoryId?: string;
  currency: CurrencyCode;
  totalAmount: MoneyAmount;
  effectiveDate: IsoDate;
  dueDate?: IsoDate;
  tags?: string[];
  postings: Posting[];
  /** Compra parcelada: grupo comum a todas as parcelas. */
  installmentGroupId?: string | null;
  /** Numero da parcela (1..installmentCount). */
  installmentNumber?: number | null;
  /** Quantidade total de parcelas da compra. */
  installmentCount?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTransactionRequest {
  type: TransactionType;
  status?: TransactionStatus;
  description: string;
  notes?: string;
  categoryId?: string;
  currency?: CurrencyCode;
  totalAmount: MoneyAmount;
  effectiveDate: IsoDate;
  dueDate?: IsoDate;
  tags?: string[];
  postings: Array<{
    accountId: string;
    amount: MoneyAmount;
    direction: 'debit' | 'credit';
    effectiveDate?: IsoDate;
  }>;
}

/** Comprovante (recibo/documento) anexado a uma transacao. */
export interface Attachment {
  id: string;
  transactionId: string;
  fileName: string;
  contentType: string;
  /** Tamanho em bytes. */
  size: number;
  /** SHA-256 do conteudo, para auditoria e deduplicacao. */
  checksum: string;
  createdAt: string;
}

export interface AttachmentListResponse {
  items: Attachment[];
}

export type InvoiceStatus = 'open' | 'closed' | 'overdue' | 'paid';

export interface CreditCard {
  id: string;
  accountId: string;
  name: string;
  limit: MoneyAmount;
  closingDay: number;
  dueDay: number;
  account?: Account;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCreditCardRequest {
  name: string;
  limit: MoneyAmount;
  closingDay: number;
  dueDay: number;
  currency?: CurrencyCode;
  institution?: string;
  color?: string;
  icon?: string;
}

export interface UpdateCreditCardRequest {
  name?: string;
  limit?: MoneyAmount;
  closingDay?: number;
  dueDay?: number;
  version?: number;
}

export interface Invoice {
  id: string;
  closingDate: IsoDate;
  cycleStart: IsoDate;
  cycleEnd: IsoDate;
  dueDate: IsoDate;
  totalAmount: MoneyAmount;
  paidAmount: MoneyAmount;
  outstandingAmount: MoneyAmount;
  status: InvoiceStatus;
}

export interface PayInvoiceRequest {
  fromAccountId: string;
  amount?: MoneyAmount;
  effectiveDate?: IsoDate;
}

export interface PurchaseInstallmentsRequest {
  description: string;
  totalAmount: MoneyAmount;
  /** Numero de parcelas (1 a 48). `1` lanca uma compra a vista. */
  installments: number;
  /** Data da compra (competencia da primeira parcela). Padrao: hoje. */
  purchaseDate?: IsoDate;
  categoryId?: string;
  tags?: string[];
}

export interface InstallmentPurchase {
  /** Nulo quando a compra e a vista (`installments = 1`). */
  installmentGroupId: string | null;
  installments: number;
  totalAmount: MoneyAmount;
  purchaseDate: IsoDate;
  transactions: Transaction[];
}

export type ObligationType = 'income' | 'expense';

/**
 * Situacao da obrigacao. `overdue` e derivado na leitura (vencimento passado e
 * obrigacao ainda em aberto) e por isso nunca e gravado.
 */
export type ObligationStatus =
  | 'forecast'
  | 'pending'
  | 'partially_reconciled'
  | 'reconciled'
  | 'overdue'
  | 'ignored'
  | 'canceled';

export interface Obligation {
  id: string;
  financialSpaceId: string;
  recurrenceRuleId: string | null;
  type: ObligationType;
  description: string;
  currency: CurrencyCode;
  amount: MoneyAmount;
  dueDate: IsoDate;
  status: Exclude<ObligationStatus, 'overdue'>;
  /** true quando o vencimento ja passou e a obrigacao continua em aberto. */
  overdue: boolean;
  transactionId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateObligationRequest {
  type: ObligationType;
  description: string;
  amount: MoneyAmount;
  dueDate: IsoDate;
  currency?: CurrencyCode;
  status?: 'forecast' | 'pending';
}

export interface UpdateObligationRequest {
  description?: string;
  amount?: MoneyAmount;
  dueDate?: IsoDate;
  status?: 'forecast' | 'pending' | 'ignored' | 'canceled';
  version?: number;
}

export interface ReconcileObligationRequest {
  transactionId: string;
}

export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

/** Dados replicados em cada ocorrencia gerada pela regra. */
export interface RecurrenceTemplate {
  type: ObligationType;
  description: string;
  amount: MoneyAmount;
  currency?: CurrencyCode;
  categoryId?: string;
  accountId?: string;
}

export interface RecurrenceRule {
  id: string;
  financialSpaceId: string;
  frequency: RecurrenceFrequency;
  interval: number;
  startDate: IsoDate;
  endDate: IsoDate | null;
  occurrencesLimit: number | null;
  template: RecurrenceTemplate;
  timezone: string;
  state: 'active' | 'archived';
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRecurrenceRequest {
  frequency: RecurrenceFrequency;
  interval?: number;
  startDate: IsoDate;
  endDate?: IsoDate;
  occurrencesLimit?: number;
  template: RecurrenceTemplate;
  /** Horizonte de materializacao das previsoes. Padrao: hoje + 12 meses. */
  generateUpTo?: IsoDate;
}

export interface UpdateRecurrenceRequest {
  frequency?: RecurrenceFrequency;
  interval?: number;
  /** Enviar `null` remove o fim da vigencia. */
  endDate?: IsoDate | null;
  /** Enviar `null` remove o limite de ocorrencias. */
  occurrencesLimit?: number | null;
  template?: RecurrenceTemplate;
  state?: 'active' | 'archived';
  generateUpTo?: IsoDate;
  version?: number;
}

export interface RecurrenceRuleView extends RecurrenceRule {
  /** Ocorrencias previstas criadas na materializacao disparada por esta operacao. */
  generatedCount: number;
}

export interface RecurrenceGeneration {
  /** Ocorrencias criadas agora: `0` quando a geracao e reexecutada. */
  generatedCount: number;
  /** Ocorrencias previstas pela agenda dentro do horizonte. */
  plannedCount: number;
  horizon: IsoDate;
}

/** Origem de uma entrada do calendario financeiro. */
export type CalendarEntryKind = 'obligation' | 'invoice';

/** Vencimento previsto (conta a pagar/receber ou fatura de cartao). */
export interface CalendarEntry {
  kind: CalendarEntryKind;
  /** Identidade estavel da origem: id da obrigacao ou `cardId:closingDate` da fatura. */
  id: string;
  description: string;
  type: ObligationType;
  amount: MoneyAmount;
  status: string;
  /** true quando o prazo passou e a entrada continua em aberto. */
  overdue: boolean;
  dueDate: IsoDate;
}

/** Vencimentos agrupados por dia, com os totais do dia. */
export interface CalendarDay {
  date: IsoDate;
  incomeTotal: MoneyAmount;
  expenseTotal: MoneyAmount;
  entries: CalendarEntry[];
}

export interface CalendarView {
  from: IsoDate;
  to: IsoDate;
  /** Apenas os dias que possuem ao menos um vencimento. */
  days: CalendarDay[];
  totals: {
    income: MoneyAmount;
    expense: MoneyAmount;
    net: MoneyAmount;
    entryCount: number;
    overdueCount: number;
  };
}

/** Urgencia de um vencimento em aberto. */
export type AlertSeverity = 'overdue' | 'due_today' | 'due_soon';

/** Vencimento em aberto classificado pela proximidade do prazo. */
export interface AlertEntry {
  kind: CalendarEntryKind;
  /** Identidade estavel da origem: id da obrigacao ou `cardId:closingDate` da fatura. */
  id: string;
  description: string;
  type: ObligationType;
  amount: MoneyAmount;
  status: string;
  /** true quando o prazo passou e a entrada continua em aberto. */
  overdue: boolean;
  dueDate: IsoDate;
  severity: AlertSeverity;
  /** Dias ate o vencimento (negativo quando ja venceu). */
  daysUntilDue: number;
}

export interface AlertsView {
  today: IsoDate;
  horizonDays: number;
  counts: {
    overdue: number;
    dueToday: number;
    dueSoon: number;
    total: number;
  };
  /** Do mais urgente (vencido) ao menos urgente. */
  alerts: AlertEntry[];
}

/** Um dia do horizonte de projecao, com o saldo acumulado ao fim dele. */
export interface ProjectionPoint {
  date: IsoDate;
  inflow: MoneyAmount;
  outflow: MoneyAmount;
  net: MoneyAmount;
  /** Saldo projetado ao fim do dia. */
  balance: MoneyAmount;
}

/**
 * Saldo projetado (Fase 3): leitura derivada que parte do saldo realizado de
 * hoje e caminha para frente somando os compromissos em aberto pelo vencimento.
 */
export interface BalanceProjectionView {
  today: IsoDate;
  horizonDays: number;
  /** Saldo realizado de partida (tudo confirmado ate hoje). */
  openingBalance: MoneyAmount;
  /** Saldo projetado ao fim do horizonte. */
  closingBalance: MoneyAmount;
  /** Menor saldo projetado no horizonte (inclui o de partida). */
  minBalance: MoneyAmount;
  minBalanceDate: IsoDate;
  /** true quando o saldo fica negativo em algum ponto do horizonte. */
  willGoNegative: boolean;
  /** Quantidade de compromissos considerados no horizonte. */
  upcomingCount: number;
  /** Saida prevista total no horizonte. */
  upcomingAmount: MoneyAmount;
  /** Somente os dias que possuem movimento previsto. */
  points: ProjectionPoint[];
}

/** Orcamento mensal (ou periodico) por categoria. `categoryId` nulo = todas as despesas. */
export interface Budget {
  id: string;
  financialSpaceId: string;
  periodStart: IsoDate;
  periodEnd: IsoDate;
  categoryId?: string | null;
  amountLimit: MoneyAmount;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBudgetRequest {
  periodStart: IsoDate;
  periodEnd: IsoDate;
  amountLimit: MoneyAmount;
  categoryId?: string;
}

export interface UpdateBudgetRequest {
  amountLimit?: MoneyAmount;
  /** Enviar `null` remove a restricao de categoria (orcamento geral). */
  categoryId?: string | null;
}

/** Situacao do consumo frente ao limite. */
export type BudgetStatus = 'ok' | 'warning' | 'exceeded';

export interface BudgetProgress {
  id: string;
  categoryId: string | null;
  categoryName: string | null;
  periodStart: IsoDate;
  periodEnd: IsoDate;
  amountLimit: MoneyAmount;
  /** Despesas confirmadas no periodo (realizado). */
  spentAmount: MoneyAmount;
  /** Limite menos realizado; negativo quando estourou. */
  remainingAmount: MoneyAmount;
  /** Percentual consumido (0-100+). */
  usagePercent: number;
  status: BudgetStatus;
}

export interface BudgetsView {
  periodStart: IsoDate;
  periodEnd: IsoDate;
  items: BudgetProgress[];
  totals: {
    amountLimit: MoneyAmount;
    spentAmount: MoneyAmount;
    remainingAmount: MoneyAmount;
  };
}

/** Alerta de orcamento: consumo em atencao (>= 80%) ou estourado. */
export interface BudgetAlert {
  budgetId: string;
  categoryId: string | null;
  categoryName: string | null;
  periodStart: IsoDate;
  periodEnd: IsoDate;
  amountLimit: MoneyAmount;
  spentAmount: MoneyAmount;
  remainingAmount: MoneyAmount;
  usagePercent: number;
  status: Exclude<BudgetStatus, 'ok'>;
}

/** Aviso de que o saldo projetado fica negativo dentro do horizonte. */
export interface NegativeBalanceAlert {
  minBalance: MoneyAmount;
  minBalanceDate: IsoDate;
}

/**
 * Alertas de planejamento (Fase 3): leitura derivada que reune, em uma so
 * visao, os orcamentos ja em atencao/estourados e o aviso de saldo projetado
 * negativo. Nada e gravado.
 */
export interface PlanningAlertsView {
  today: IsoDate;
  horizonDays: number;
  counts: {
    budgets: number;
    negativeBalance: number;
    total: number;
  };
  /** Presente apenas quando o saldo projetado fica negativo no horizonte. */
  negativeBalance: NegativeBalanceAlert | null;
  /** Orcamentos em atencao/estourados, do mais critico ao menos. */
  budgetAlerts: BudgetAlert[];
}

export type GoalState = 'active' | 'archived';

/** Meta financeira: valor-alvo, acumulado e prazo. */
export interface Goal {
  id: string;
  financialSpaceId: string;
  name: string;
  targetAmount: MoneyAmount;
  currentAmount: MoneyAmount;
  deadline: IsoDate | null;
  color?: string | null;
  icon?: string | null;
  state: GoalState;
  createdAt: string;
  updatedAt: string;
}

export interface CreateGoalRequest {
  name: string;
  targetAmount: MoneyAmount;
  deadline?: IsoDate;
  color?: string;
  icon?: string;
}

export interface UpdateGoalRequest {
  name?: string;
  targetAmount?: MoneyAmount;
  /** Enviar `null` remove o prazo. */
  deadline?: IsoDate | null;
  color?: string | null;
  icon?: string | null;
  state?: GoalState;
}

/** Aporte que incrementa o acumulado da meta. */
export interface GoalContributionRequest {
  amount: MoneyAmount;
}

/** Situacao da meta frente ao alvo e ao prazo. */
export type GoalStatus = 'active' | 'achieved' | 'overdue';

export interface GoalProgress {
  id: string;
  name: string;
  targetAmount: MoneyAmount;
  currentAmount: MoneyAmount;
  /** Alvo menos acumulado; negativo quando a meta foi superada. */
  remainingAmount: MoneyAmount;
  /** Percentual acumulado (0-100+). */
  progressPercent: number;
  deadline: IsoDate | null;
  /** true quando o prazo passou e a meta ainda nao foi atingida. */
  overdue: boolean;
  status: GoalStatus;
  state: GoalState;
  color?: string | null;
  icon?: string | null;
}

export interface GoalsView {
  today: IsoDate;
  items: GoalProgress[];
  totals: {
    targetAmount: MoneyAmount;
    currentAmount: MoneyAmount;
    remainingAmount: MoneyAmount;
  };
}

export interface Paginated<T> {
  items: T[];
  total: number;
  nextCursor?: string;
}

export interface DashboardSummary {
  periodStart: IsoDate;
  periodEnd: IsoDate;
  /** Moeda de reporte do espaco: os totais ja vem convertidos para ela. */
  currency: CurrencyCode;
  totalIncome: MoneyAmount;
  totalExpense: MoneyAmount;
  netBalance: MoneyAmount;
  realizedBalance: MoneyAmount;
  projectedBalance: MoneyAmount;
  upcomingDueCount: number;
  upcomingDueAmount: MoneyAmount;
  /**
   * Quantos lancamentos do periodo foram ignorados nos totais por nao haver
   * taxa de cambio da moeda do lancamento para a moeda de reporte.
   */
  unconvertedCount: number;
}

/** Totais realizados de um mes (receitas, despesas e liquido, ja em `MoneyAmount`). */
export interface MonthlyMetrics {
  /** Competencia no formato `YYYY-MM`. */
  month: string;
  periodStart: IsoDate;
  periodEnd: IsoDate;
  income: MoneyAmount;
  expense: MoneyAmount;
  /** Receitas menos despesas do mes. */
  net: MoneyAmount;
}

/** Comparacao de uma metrica entre o mes corrente e o anterior. */
export interface MetricComparison {
  current: MoneyAmount;
  previous: MoneyAmount;
  /** `current - previous`. */
  delta: MoneyAmount;
  /** Variacao percentual sobre o mes anterior; `null` quando o anterior e zero. */
  deltaPercent: number | null;
}

/**
 * Comparacoes mensais (Fase 3): leitura derivada que compara os totais
 * realizados do mes corrente com os do mes anterior.
 */
export interface MonthlyComparisonView {
  current: MonthlyMetrics;
  previous: MonthlyMetrics;
  comparison: {
    income: MetricComparison;
    expense: MetricComparison;
    net: MetricComparison;
  };
}

/** Saldo realizado de uma conta no patrimonio liquido. */
export interface NetWorthAccount {
  accountId: string;
  name: string;
  type: AccountType;
  /** Moeda da conta; `balance` esta nessa moeda. */
  currency: CurrencyCode;
  /** Saldo assinado: positivo em ativos, negativo em cartoes (passivo). */
  balance: MoneyAmount;
  /**
   * Saldo convertido para a moeda de reporte do espaco (`NetWorthView.currency`).
   * Igual a `balance` quando a conta ja esta na moeda de reporte; `null` quando
   * nao existe taxa de cambio para a conversao.
   */
  balanceInBase: MoneyAmount | null;
}

/** Patrimonio liquido (Fase 4): ativos menos passivos, com o detalhe por conta. */
export interface NetWorthView {
  /** Moeda de reporte do espaco: ativos, passivos e patrimonio vem nela. */
  currency: CurrencyCode;
  assets: MoneyAmount;
  liabilities: MoneyAmount;
  netWorth: MoneyAmount;
  accounts: NetWorthAccount[];
}

/** Taxa de poupanca (Fase 4): quanto das receitas do mes sobrou. */
export interface SavingsRateView {
  /** Competencia no formato `YYYY-MM`. */
  month: string;
  income: MoneyAmount;
  expense: MoneyAmount;
  /** `income - expense`. */
  saved: MoneyAmount;
  /** `saved / income` em percentual; `null` quando nao houve receita. */
  rate: number | null;
}

/** Ponto da evolucao mensal (Fase 4). */
export interface MonthlyEvolutionPoint {
  /** Competencia no formato `YYYY-MM`. */
  month: string;
  income: MoneyAmount;
  expense: MoneyAmount;
  net: MoneyAmount;
}

/**
 * Relatorios avancados (Fase 4): leitura derivada que reune o patrimonio
 * liquido (posicao atual), a taxa de poupanca do mes e a evolucao mensal.
 */
export interface AdvancedReportView {
  /** Competencia de referencia (mes da taxa de poupanca e fim da evolucao). */
  month: string;
  netWorth: NetWorthView;
  savings: SavingsRateView;
  evolution: MonthlyEvolutionPoint[];
}

/** Movimento hipotetico de um cenario ("e se eu gastar/receber X em tal dia?"). */
export interface ScenarioAdjustment {
  description: string;
  type: 'income' | 'expense';
  amount: MoneyAmount;
  /** Data em que o movimento aconteceria (YYYY-MM-DD). */
  date: IsoDate;
}

/** Comparacao entre o saldo projetado real e o do cenario. */
export interface ScenarioImpact {
  /** `closingBalance(scenario) - closingBalance(base)`: quanto sobra a mais (ou a menos) no fim. */
  closingBalanceDelta: MoneyAmount;
  /** `minBalance(scenario) - minBalance(base)`: variacao do pior momento (inclui o saldo de partida). */
  minBalanceDelta: MoneyAmount;
  /** true quando o cenario fica negativo em algum ponto do horizonte. */
  willGoNegative: boolean;
  /** true quando o real nao ficava negativo mas o cenario passa a ficar. */
  turnsNegative: boolean;
  /** true quando o saldo final do cenario e maior que o do real. */
  improves: boolean;
}

/**
 * Cenario simples (Fase 3): simula movimentos hipoteticos sobre o saldo
 * projetado sem gravar nada. Devolve a projecao real, a do cenario e o impacto.
 */
export interface ScenarioView {
  base: BalanceProjectionView;
  scenario: BalanceProjectionView;
  adjustments: ScenarioAdjustment[];
  impact: ScenarioImpact;
}

export interface CreateScenarioRequest {
  /** Horizonte em dias da simulacao (1 a 180; padrao 30). */
  horizonDays?: number;
  /** Movimentos hipoteticos somados ao saldo projetado. */
  adjustments: ScenarioAdjustment[];
}

/** Situacao de um lote de importacao. `previewed` = ainda nao aplicado. */
export type ImportBatchStatus = 'previewed' | 'committed' | 'undone';

/** Formato do extrato importado. */
export type ImportFormat = 'csv' | 'ofx';

/** Situacao de uma linha do extrato na previa. */
export type ImportRowStatus = 'valid' | 'invalid' | 'duplicate';

/** Linha do extrato ja interpretada (com o resultado da validacao e deduplicacao). */
export interface ImportRow {
  /** Numero fisico no arquivo (linha do CSV ou ordem do lancamento no OFX). */
  line: number;
  date: IsoDate | null;
  description: string;
  /** Valor absoluto; o sinal e dado por `type`. */
  amount: MoneyAmount | null;
  type: ObligationType | null;
  status: ImportRowStatus;
  /** Codigos dos problemas encontrados (ex.: `data_invalida`). */
  errors: string[];
  /** Origem da duplicidade: repetida no proprio arquivo ou ja existente. */
  duplicateOf?: 'file' | 'existing';
  /** Identificador do lancamento no extrato (FITID no OFX). */
  fitId?: string | null;
}

export interface ImportSummary {
  total: number;
  valid: number;
  invalid: number;
  duplicates: number;
}

/** Lote de importacao persistido para auditoria e desfazer. */
export interface ImportBatch {
  id: string;
  financialSpaceId: string;
  accountId: string;
  status: ImportBatchStatus;
  /** Formato do extrato de origem do lote. */
  format: ImportFormat;
  fileName: string | null;
  rowCount: number;
  validCount: number;
  invalidCount: number;
  duplicateCount: number;
  importedCount: number;
  committedAt: string | null;
  undoneAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Resultado da previa: o lote criado (nao aplicado) + as linhas classificadas. */
export interface ImportPreview {
  batch: ImportBatch;
  rows: ImportRow[];
  summary: ImportSummary;
}

/** Resultado da aplicacao de um lote. */
export interface CommitImportResult {
  batch: ImportBatch;
  importedCount: number;
  /** Linhas validas descartadas no commit por virarem duplicatas nesse meio-tempo. */
  skippedCount: number;
}

export interface PreviewCsvImportRequest {
  csv: string;
  /** Conta de destino dos lancamentos importados. */
  accountId: string;
  fileName?: string;
}

export interface PreviewOfxImportRequest {
  ofx: string;
  /** Conta de destino dos lancamentos importados. */
  accountId: string;
  fileName?: string;
}

/** Faixa de confianca de um casamento entre previsto e item importado. */
export type ReconciliationBand = 'high' | 'medium' | 'low';

/** Motivo que contribuiu para a pontuacao do casamento. */
export type ReconciliationReason =
  | 'valor_igual'
  | 'valor_cobre'
  | 'valor_proximo'
  | 'mesma_data'
  | 'data_proxima'
  | 'descricao_similar';

/** Conta prevista/em aberto ainda candidata a conciliacao. */
export interface ReconciliationObligation {
  id: string;
  description: string;
  type: ObligationType;
  amount: MoneyAmount;
  dueDate: IsoDate;
  status: Exclude<ObligationStatus, 'overdue'>;
  /** true quando o vencimento ja passou e a conta continua em aberto. */
  overdue: boolean;
}

/** Item importado (lancamento confirmado criado por um lote) candidato. */
export interface ReconciliationTransaction {
  id: string;
  description: string;
  type: ObligationType;
  totalAmount: MoneyAmount;
  effectiveDate: IsoDate;
  /** Lote de importacao que originou o item (null quando o lancamento e avulso). */
  batchId: string | null;
}

/** Casamento sugerido entre uma conta prevista e um item importado. */
export interface ReconciliationSuggestion {
  obligationId: string;
  transactionId: string;
  /** 0 a 100; quanto maior, mais forte o casamento. */
  score: number;
  band: ReconciliationBand;
  reasons: ReconciliationReason[];
}

/** Visao da conciliacao: candidatos + sugestoes automaticas (1:1). */
export interface ReconciliationView {
  /** Lote considerado (null quando a visao abrange todos os lotes importados). */
  batchId: string | null;
  obligations: ReconciliationObligation[];
  transactions: ReconciliationTransaction[];
  suggestions: ReconciliationSuggestion[];
  counts: { high: number; medium: number; low: number };
}

/** Par conta prevista x item importado a conciliar. */
export interface ReconciliationMatch {
  obligationId: string;
  transactionId: string;
}

export interface ApplyReconciliationRequest {
  matches: ReconciliationMatch[];
}

/** Resultado da conciliacao de um par. */
export interface ReconciliationApplied {
  obligationId: string;
  transactionId: string;
  status: 'reconciled' | 'partially_reconciled';
}

export interface ApplyReconciliationResult {
  applied: ReconciliationApplied[];
  appliedCount: number;
}

export interface AutoReconcileRequest {
  /** Restringe a um lote; ausente considera todos os lotes importados. */
  batchId?: string;
}

/** Como o padrao da regra de categorizacao e comparado com a descricao. */
export type RuleMatchType = 'contains' | 'equals' | 'startsWith';

/** Situacao de uma regra de categorizacao (`archived` deixa de ser aplicada). */
export type CategorizationRuleState = 'active' | 'archived';

/**
 * Regra que categoriza automaticamente um lancamento pela descricao. A primeira
 * regra (menor `priority`) que casar define a categoria; `type` nulo casa os
 * dois tipos (receita e despesa).
 */
export interface CategorizationRule {
  id: string;
  financialSpaceId: string;
  name: string;
  matchType: RuleMatchType;
  pattern: string;
  categoryId: string;
  categoryName: string | null;
  /** Filtro opcional pelo tipo do lancamento; nulo aplica a receita e despesa. */
  type: TransactionType | null;
  /** Menor valor = maior precedencia. */
  priority: number;
  state: CategorizationRuleState;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface CreateCategorizationRuleRequest {
  name: string;
  matchType: RuleMatchType;
  pattern: string;
  categoryId: string;
  /** Restringe a regra a receita ou despesa; ausente aplica a ambos. */
  type?: TransactionType;
  /** Padrao 100. Menor valor = aplicada antes. */
  priority?: number;
}

export interface UpdateCategorizationRuleRequest {
  name?: string;
  matchType?: RuleMatchType;
  pattern?: string;
  categoryId?: string;
  /** Enviar `null` remove o filtro de tipo (aplica a receita e despesa). */
  type?: TransactionType | null;
  priority?: number;
  state?: CategorizationRuleState;
  /** Concorrencia otimista. */
  version?: number;
}

/** Resultado da aplicacao retroativa das regras aos lancamentos sem categoria. */
export interface ApplyCategorizationResult {
  /** Lancamentos sem categoria examinados no periodo. */
  scanned: number;
  /** Lancamentos que receberam categoria por alguma regra. */
  applied: number;
}

/** Canal pelo qual uma notificacao pode ser entregue. */
export type NotificationChannel = 'email' | 'push' | 'desktop';

/** Tipos de notificacao previstos no MVP. */
export type NotificationType =
  | 'upcoming_due'
  | 'invoice_due'
  | 'budget_threshold'
  | 'negative_balance';

/** Canais habilitados para um tipo de notificacao. */
export interface NotificationChannelSettings {
  email: boolean;
  push: boolean;
  desktop: boolean;
}

/** Janela em que as notificacoes ficam silenciadas, avaliada no fuso do usuario. */
export interface QuietHours {
  enabled: boolean;
  /** Inicio no formato `HH:MM`. */
  start: string;
  /** Fim no formato `HH:MM`; pode ser menor que o inicio (janela que cruza a meia-noite). */
  end: string;
}

/**
 * Preferencias de notificacao e privacidade do usuario. Sao por usuario (nao por
 * espaco) e valem para todos os espacos em que ele participa.
 */
export interface NotificationPreferences {
  /** Canais habilitados por tipo de notificacao. */
  channels: Record<NotificationType, NotificationChannelSettings>;
  quietHours: QuietHours;
  /** Privacidade: quando `false`, as notificacoes nao exibem valores. */
  includeAmounts: boolean;
  /** Fuso usado para avaliar o horario silencioso. */
  timezone: string;
  updatedAt: string;
}

export interface UpdateNotificationPreferencesRequest {
  channels?: Partial<Record<NotificationType, Partial<NotificationChannelSettings>>>;
  quietHours?: Partial<QuietHours>;
  includeAmounts?: boolean;
}

export interface AuthResponse {
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  tokenType: 'Bearer' | string;
  /** true quando a senha esta correta mas o segundo fator (MFA) precisa ser confirmado. */
  mfaRequired?: boolean;
  user?: {
    id: string;
    email: string;
    name: string | null;
    timezone: string;
    locale: string;
  };
}

/** Tipo de relatorio gerado de forma assincrona (Fase 5). */
export type ReportJobType = 'transactions_export';

/**
 * Situacao de um relatorio assincrono ao longo do seu ciclo de vida:
 * `pending` (enfileirado), `running` (em processamento), `done` (resultado
 * disponivel para download) e `error` (falhou; `error` traz o motivo).
 */
export type ReportJobStatus = 'pending' | 'running' | 'done' | 'error';

/** Filtros aceitos pela exportacao assincrona de lancamentos. */
export interface ReportJobParams {
  /** Inicio do periodo (YYYY-MM-DD), inclusive. */
  from?: string;
  /** Fim do periodo (YYYY-MM-DD), inclusive. */
  to?: string;
}

/**
 * Relatorio assincrono: o pedido e gravado na hora e processado em background
 * pelo worker; o resultado fica em cache no proprio job ate ser baixado.
 */
export interface ReportJob {
  id: string;
  financialSpaceId: string;
  type: ReportJobType;
  status: ReportJobStatus;
  params: ReportJobParams;
  /** Quantidade de linhas geradas; `null` enquanto o job nao termina. */
  rowCount: number | null;
  /** Motivo da falha quando `status = 'error'`. */
  error: string | null;
  requestedBy: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface CreateReportJobRequest {
  type: ReportJobType;
  /** Inicio do periodo (YYYY-MM-DD). Padrao: 30 dias antes de hoje. */
  from?: string;
  /** Fim do periodo (YYYY-MM-DD). Padrao: hoje. */
  to?: string;
}

export type { CurrencyCode, MoneyAmount, IsoDate, UuidSchema };

/** Situacao de um consentimento de Open Finance (Fase 5). */
export type OpenFinanceConsentStatus =
  | 'pending'
  | 'authorized'
  | 'rejected'
  | 'expired'
  | 'revoked';

/**
 * Consentimento de Open Finance de um espaco com uma instituicao. O ciclo de
 * vida e dirigido pelo agregador; `consentUrl` e a pagina hospedada onde o
 * usuario autoriza o acesso.
 */
export interface OpenFinanceConsent {
  id: string;
  financialSpaceId: string;
  institutionId: string;
  institutionName: string;
  status: OpenFinanceConsentStatus;
  /** URL de autorizacao no provedor; `null` apos revogado. */
  consentUrl: string | null;
  /** Validade do consentimento (ISO-8601) ou `null` quando sem prazo. */
  expiresAt: string | null;
  revokedAt: string | null;
  /** Conta de destino dos lancamentos sincronizados; `null` se ainda nao definida. */
  targetAccountId: string | null;
  /** Momento da ultima sincronizacao incremental (ISO-8601) ou `null`. */
  lastSyncedAt: string | null;
  /** Quantos lancamentos externos ja foram importados por este consentimento. */
  syncedCount: number;
  createdAt: string;
  updatedAt: string;
  version: number;
}

/** Resultado de uma sincronizacao incremental do consentimento. */
export interface OpenFinanceSyncResult {
  consent: OpenFinanceConsent;
  /** Lancamentos novos criados nesta chamada. */
  importedCount: number;
  /** Lancamentos recebidos que ja constavam (nao importados). */
  skippedCount: number;
  /** `true` quando ainda ha mais paginas a sincronizar no agregador. */
  hasMore: boolean;
}

export interface SyncOpenFinanceConsentRequest {
  /** Conta de destino dos lancamentos. Padrao: a ultima conta usada. */
  accountId?: string;
}

/** Instituicao do provedor de Open Finance, com o consentimento do espaco. */
export interface OpenFinanceInstitution {
  id: string;
  name: string;
  logoUrl: string | null;
  /** Consentimento existente para a instituicao; `null` quando nao conectada. */
  consent: OpenFinanceConsent | null;
  /** true quando ha consentimento autorizado e dentro do prazo. */
  connected: boolean;
}

export interface CreateOpenFinanceConsentRequest {
  institutionId: string;
  /** URL de retorno apos a autorizacao no provedor. */
  redirectUrl?: string;
}

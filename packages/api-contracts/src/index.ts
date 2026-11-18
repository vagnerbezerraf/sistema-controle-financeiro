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

export interface Membership {
  id: string;
  financialSpaceId: string;
  userId: string;
  role: FinancialSpaceRole;
  email?: string;
  name?: string;
  status: 'active' | 'invited' | 'revoked';
  createdAt: string;
  updatedAt: string;
}

export interface InviteMemberRequest {
  email: string;
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

export interface Paginated<T> {
  items: T[];
  total: number;
  nextCursor?: string;
}

export interface DashboardSummary {
  periodStart: IsoDate;
  periodEnd: IsoDate;
  totalIncome: MoneyAmount;
  totalExpense: MoneyAmount;
  netBalance: MoneyAmount;
  realizedBalance: MoneyAmount;
  projectedBalance: MoneyAmount;
  upcomingDueCount: number;
  upcomingDueAmount: MoneyAmount;
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

export type { CurrencyCode, MoneyAmount, IsoDate, UuidSchema };

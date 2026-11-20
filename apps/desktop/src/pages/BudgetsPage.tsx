import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthContext';
import { apiFetch } from '../lib/api';
import { formatCurrency, formatPercent, cls } from '../lib/format';
import type {
  BudgetProgress,
  BudgetsView,
  BudgetStatus,
  Category,
  CreateBudgetRequest,
} from '@scf/api-contracts';
import { Check, PiggyBank, Plus, Trash2, X } from 'lucide-react';

/** Mes corrente (`YYYY-MM`) para o periodo padrao do orcamento. */
function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** Primeiro e ultimo dia do mes informado (`YYYY-MM`). */
function monthBounds(month: string): { from: string; to: string } {
  const [year, monthNumber] = month.split('-').map(Number);
  const last = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

export default function BudgetsPage() {
  const { currentSpaceId } = useAuth();
  const qc = useQueryClient();

  const [month, setMonth] = useState(currentMonth());
  const [showCreate, setShowCreate] = useState(false);

  const range = useMemo(() => monthBounds(month), [month]);

  const budgetsQ = useQuery({
    queryKey: ['budgets', currentSpaceId, range.from, range.to],
    enabled: !!currentSpaceId,
    queryFn: () =>
      apiFetch<BudgetsView>(
        `/financial-spaces/${currentSpaceId}/budgets?from=${range.from}&to=${range.to}`,
      ),
  });

  const categoriesQ = useQuery({
    queryKey: ['categories', currentSpaceId],
    enabled: !!currentSpaceId,
    queryFn: () => apiFetch<Category[]>(`/financial-spaces/${currentSpaceId}/categories`),
  });

  const view = budgetsQ.data;
  const items = view?.items ?? [];
  const expenseCategories = useMemo(
    () => (categoriesQ.data ?? []).filter((c) => c.type === 'expense' || c.type === 'both'),
    [categoriesQ.data],
  );

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ['budgets', currentSpaceId] });
  }

  async function removeBudget(budget: BudgetProgress) {
    if (!currentSpaceId) return;
    await apiFetch(`/financial-spaces/${currentSpaceId}/budgets/${budget.id}`, { method: 'DELETE' });
    await refresh();
  }

  async function updateLimit(budget: BudgetProgress, amountLimit: string) {
    if (!currentSpaceId) return;
    await apiFetch(`/financial-spaces/${currentSpaceId}/budgets/${budget.id}`, {
      method: 'PATCH',
      json: { amountLimit },
    });
    await refresh();
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Orcamentos</h1>
          <p className="text-sm text-neutral-500">
            Limites por categoria e o consumo realizado no periodo, sem alterar o historico.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label htmlFor="orcamento-mes" className="label block">
              Mes
            </label>
            <input
              id="orcamento-mes"
              className="input mt-1"
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </div>
          <button
            type="button"
            className={showCreate ? 'btn-outline' : 'btn-primary'}
            id="orcamento-novo"
            onClick={() => setShowCreate((v) => !v)}
          >
            {showCreate ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showCreate ? 'Cancelar' : 'Novo orcamento'}
          </button>
        </div>
      </header>

      {showCreate && (
        <BudgetForm
          spaceId={currentSpaceId}
          month={month}
          categories={expenseCategories}
          onCreated={async () => {
            setShowCreate(false);
            await refresh();
          }}
        />
      )}

      <section className="grid gap-4 md:grid-cols-3">
        <SummaryCard
          id="orcamentos-total-limite"
          label="Limite total"
          value={Number(view?.totals.amountLimit ?? 0)}
          tone="text-neutral-900"
        />
        <SummaryCard
          id="orcamentos-total-consumo"
          label="Consumido"
          value={Number(view?.totals.spentAmount ?? 0)}
          tone="text-brand-700"
        />
        <SummaryCard
          id="orcamentos-saldo"
          label="Saldo do periodo"
          value={Number(view?.totals.remainingAmount ?? 0)}
          tone={Number(view?.totals.remainingAmount ?? 0) < 0 ? 'text-danger-700' : 'text-success-700'}
        />
      </section>

      <section className="card">
        <div className="card-header">
          <h2 className="card-title">Consumo por categoria</h2>
          <p className="card-subtitle">Despesas confirmadas comparadas ao limite do periodo</p>
        </div>
        <div className="card-body">
          {budgetsQ.isLoading && <p className="text-sm text-neutral-500">Carregando...</p>}
          {!budgetsQ.isLoading && items.length === 0 && (
            <div className="flex items-center gap-3 text-sm text-neutral-600">
              <PiggyBank className="h-5 w-5 text-neutral-400" />
              Nenhum orcamento neste periodo. Defina limites por categoria em Novo orcamento.
            </div>
          )}

          <ul className="divide-y divide-neutral-100">
            {items.map((budget) => (
              <BudgetRow
                key={budget.id}
                budget={budget}
                onRemove={() => removeBudget(budget)}
                onUpdateLimit={(limit) => updateLimit(budget, limit)}
              />
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
  id,
}: {
  label: string;
  value: number;
  tone: string;
  id: string;
}) {
  return (
    <div className="card" id={id}>
      <div className="card-body">
        <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
        <div className={cls('mt-1 text-2xl font-semibold', tone)}>{formatCurrency(value)}</div>
      </div>
    </div>
  );
}

function BudgetRow({
  budget,
  onRemove,
  onUpdateLimit,
}: {
  budget: BudgetProgress;
  onRemove: () => void;
  onUpdateLimit: (limit: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [limit, setLimit] = useState(budget.amountLimit);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    setBusy(true);
    try {
      await onUpdateLimit(limit.trim());
      setEditing(false);
    } catch (e: any) {
      setError(e?.details?.message ?? e?.message ?? 'Nao foi possivel atualizar o limite');
    } finally {
      setBusy(false);
    }
  }

  return (
    <li id={`orcamento-${budget.id}`} className="py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-neutral-900">
              {budget.categoryName ?? 'Geral (todas as despesas)'}
            </span>
            <span id={`orcamento-status-${budget.id}`} className={`badge ${statusBadge(budget.status)}`}>
              {statusLabel(budget.status)}
            </span>
          </div>
          <div className="text-xs text-neutral-500">
            {formatCurrency(budget.spentAmount)} de {formatCurrency(budget.amountLimit)} ·{' '}
            {formatPercent(budget.usagePercent)}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div
            id={`orcamento-saldo-${budget.id}`}
            className={cls(
              'text-sm font-semibold',
              Number(budget.remainingAmount) < 0 ? 'text-danger-700' : 'text-success-700',
            )}
          >
            {formatCurrency(budget.remainingAmount)}
          </div>
          <button
            type="button"
            className="btn-outline"
            id={`orcamento-editar-${budget.id}`}
            onClick={() => {
              setLimit(budget.amountLimit);
              setEditing((v) => !v);
            }}
          >
            {editing ? 'Cancelar' : 'Editar limite'}
          </button>
          <button
            type="button"
            className="btn-outline"
            id={`orcamento-remover-${budget.id}`}
            onClick={onRemove}
          >
            <Trash2 className="h-4 w-4" /> Remover
          </button>
        </div>
      </div>

      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-neutral-100">
        <div
          id={`orcamento-progresso-${budget.id}`}
          className={cls('h-full rounded-full transition duration-normal', statusBar(budget.status))}
          style={{ width: `${Math.min(budget.usagePercent, 100)}%` }}
        />
      </div>

      {editing && (
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor={`orcamento-limite-input-${budget.id}`} className="label block">
              Novo limite
            </label>
            <input
              id={`orcamento-limite-input-${budget.id}`}
              className="input mt-1"
              inputMode="decimal"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="btn-primary"
            id={`orcamento-limite-salvar-${budget.id}`}
            disabled={busy}
            onClick={save}
          >
            <Check className="h-4 w-4" /> {busy ? 'Salvando...' : 'Salvar'}
          </button>
          {error && <span className="text-sm text-danger-700">{error}</span>}
        </div>
      )}
    </li>
  );
}

function BudgetForm({
  spaceId,
  month,
  categories,
  onCreated,
}: {
  spaceId: string | null;
  month: string;
  categories: Category[];
  onCreated: () => void;
}) {
  const [categoryId, setCategoryId] = useState('');
  const [amountLimit, setAmountLimit] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!spaceId) return;
    setError(null);
    setBusy(true);
    try {
      const range = monthBounds(month);
      const body: CreateBudgetRequest = {
        periodStart: range.from,
        periodEnd: range.to,
        amountLimit: amountLimit.trim(),
        ...(categoryId ? { categoryId } : {}),
      };
      await apiFetch(`/financial-spaces/${spaceId}/budgets`, { method: 'POST', json: body });
      setCategoryId('');
      setAmountLimit('');
      onCreated();
    } catch (e: any) {
      setError(e?.details?.message ?? e?.message ?? 'Nao foi possivel criar o orcamento');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <div className="card-header">
        <h2 className="card-title text-lg">Novo orcamento</h2>
        <p className="card-subtitle">
          O limite vale para o mes selecionado. Sem categoria, vale para todas as despesas.
        </p>
      </div>
      <form className="card-body space-y-4" onSubmit={submit}>
        {error && (
          <div className="rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700">
            {error}
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label htmlFor="orcamento-categoria" className="label block">
              Categoria
            </label>
            <select
              id="orcamento-categoria"
              className="input mt-1"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">Geral (todas as despesas)</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="orcamento-limite" className="label block">
              Limite
            </label>
            <input
              id="orcamento-limite"
              className="input mt-1"
              inputMode="decimal"
              placeholder="Ex.: 1000.00"
              value={amountLimit}
              onChange={(e) => setAmountLimit(e.target.value)}
              required
            />
          </div>
        </div>
        <button type="submit" className="btn-primary" id="orcamento-salvar" disabled={busy}>
          {busy ? 'Criando...' : 'Criar orcamento'}
        </button>
      </form>
    </section>
  );
}

function statusLabel(status: BudgetStatus): string {
  switch (status) {
    case 'exceeded':
      return 'Estourado';
    case 'warning':
      return 'Em atencao';
    default:
      return 'Dentro do limite';
  }
}

function statusBadge(status: BudgetStatus): string {
  switch (status) {
    case 'exceeded':
      return 'border-danger-200 bg-danger-50 text-danger-700';
    case 'warning':
      return 'border-warning-200 bg-warning-50 text-warning-700';
    default:
      return 'border-success-200 bg-success-50 text-success-700';
  }
}

function statusBar(status: BudgetStatus): string {
  switch (status) {
    case 'exceeded':
      return 'bg-danger-500';
    case 'warning':
      return 'bg-warning-500';
    default:
      return 'bg-success-500';
  }
}

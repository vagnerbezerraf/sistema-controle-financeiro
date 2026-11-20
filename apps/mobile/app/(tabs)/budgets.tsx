import { useMemo, useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, RefreshControl } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../src/auth/AuthContext';
import { apiFetch } from '../../src/lib/api';
import type {
  BudgetProgress,
  BudgetStatus,
  BudgetsView,
  Category,
  CreateBudgetRequest,
} from '@scf/api-contracts';
import { Check, PiggyBank, Plus, Trash2, X } from 'lucide-react-native';

function formatCurrency(n: string | number) {
  const v = typeof n === 'string' ? Number(n) : n;
  return isFinite(v) ? `R$ ${v.toFixed(2).replace('.', ',')}` : '-';
}

function formatPercent(n: number) {
  return isFinite(n) ? `${n.toFixed(1).replace('.', ',')}%` : '-';
}

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
      return 'bg-danger-50 text-danger-700';
    case 'warning':
      return 'bg-warning-50 text-warning-700';
    default:
      return 'bg-success-50 text-success-700';
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

export default function BudgetsScreen() {
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
    <ScrollView
      className="flex-1 bg-neutral-50"
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={budgetsQ.isFetching}
          onRefresh={() => budgetsQ.refetch()}
          tintColor="#1e57f5"
        />
      }
    >
      <View className="flex-row items-start justify-between">
        <View className="flex-1">
          <Text className="text-2xl font-bold text-neutral-900">Orcamentos</Text>
          <Text className="text-sm text-neutral-500">
            Limites por categoria e o consumo realizado no periodo.
          </Text>
        </View>
        <Pressable
          testID="orcamento-novo"
          onPress={() => setShowCreate((v) => !v)}
          className="ml-3 flex-row items-center gap-1 rounded-lg bg-brand-600 px-3 py-2"
        >
          {showCreate ? <X size={16} color="white" /> : <Plus size={16} color="white" />}
          <Text className="text-sm font-medium text-white">{showCreate ? 'Cancelar' : 'Novo'}</Text>
        </Pressable>
      </View>

      <Text className="mt-4 text-xs font-medium text-neutral-700">Mes</Text>
      <TextInput
        testID="orcamento-mes"
        className="mt-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-neutral-900"
        placeholder="AAAA-MM"
        placeholderTextColor="#94a3b8"
        value={month}
        onChangeText={setMonth}
      />

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

      <View className="mt-5 flex-row gap-3">
        <View testID="orcamentos-total-limite" className="flex-1 rounded-xl border border-neutral-200 bg-white p-3 shadow-sm">
          <Text className="text-xs uppercase text-neutral-500">Limite total</Text>
          <Text className="mt-1 text-base font-semibold text-neutral-900">
            {formatCurrency(Number(view?.totals.amountLimit ?? 0))}
          </Text>
        </View>
        <View testID="orcamentos-total-consumo" className="flex-1 rounded-xl border border-neutral-200 bg-white p-3 shadow-sm">
          <Text className="text-xs uppercase text-neutral-500">Consumido</Text>
          <Text className="mt-1 text-base font-semibold text-brand-700">
            {formatCurrency(Number(view?.totals.spentAmount ?? 0))}
          </Text>
        </View>
        <View testID="orcamentos-saldo" className="flex-1 rounded-xl border border-neutral-200 bg-white p-3 shadow-sm">
          <Text className="text-xs uppercase text-neutral-500">Saldo</Text>
          <Text
            className={`mt-1 text-base font-semibold ${
              Number(view?.totals.remainingAmount ?? 0) < 0 ? 'text-danger-700' : 'text-success-700'
            }`}
          >
            {formatCurrency(Number(view?.totals.remainingAmount ?? 0))}
          </Text>
        </View>
      </View>

      <View className="mt-5 rounded-xl border border-neutral-200 bg-white shadow-sm">
        <View className="border-b border-neutral-100 p-4">
          <Text className="text-base font-semibold text-neutral-900">Consumo por categoria</Text>
          <Text className="mt-0.5 text-xs text-neutral-500">
            Despesas confirmadas comparadas ao limite do periodo
          </Text>
        </View>
        <View className="p-4 space-y-4">
          {budgetsQ.isLoading && <Text className="text-sm text-neutral-500">Carregando...</Text>}
          {!budgetsQ.isLoading && items.length === 0 && (
            <View className="flex-row items-center gap-3">
              <PiggyBank size={18} color="#94a3b8" />
              <Text className="flex-1 text-sm text-neutral-600">
                Nenhum orcamento neste periodo. Defina limites em Novo.
              </Text>
            </View>
          )}
          {items.map((budget) => (
            <BudgetRow
              key={budget.id}
              budget={budget}
              onRemove={() => removeBudget(budget)}
              onUpdateLimit={(limit) => updateLimit(budget, limit)}
            />
          ))}
        </View>
      </View>
    </ScrollView>
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
    <View testID={`orcamento-${budget.id}`} className="border-b border-neutral-100 pb-4">
      <View className="flex-row items-center justify-between">
        <View className="flex-1 pr-3">
          <View className="flex-row items-center gap-2">
            <Text className="font-medium text-neutral-900">
              {budget.categoryName ?? 'Geral (todas as despesas)'}
            </Text>
            <Text className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge(budget.status)}`}>
              {statusLabel(budget.status)}
            </Text>
          </View>
          <Text className="text-xs text-neutral-500">
            {formatCurrency(budget.spentAmount)} de {formatCurrency(budget.amountLimit)} ·{' '}
            {formatPercent(budget.usagePercent)}
          </Text>
        </View>
        <Text
          testID={`orcamento-saldo-${budget.id}`}
          className={`text-sm font-semibold ${
            Number(budget.remainingAmount) < 0 ? 'text-danger-700' : 'text-success-700'
          }`}
        >
          {formatCurrency(budget.remainingAmount)}
        </Text>
      </View>

      <View className="mt-3 h-2 w-full overflow-hidden rounded-full bg-neutral-100">
        <View
          testID={`orcamento-progresso-${budget.id}`}
          className={`h-full rounded-full ${statusBar(budget.status)}`}
          style={{ width: `${Math.min(budget.usagePercent, 100)}%` }}
        />
      </View>

      <View className="mt-3 flex-row items-center gap-2">
        <Pressable
          testID={`orcamento-editar-${budget.id}`}
          onPress={() => {
            setLimit(budget.amountLimit);
            setEditing((v) => !v);
          }}
          className="rounded-lg border border-neutral-300 bg-white px-3 py-1"
        >
          <Text className="text-xs font-medium text-neutral-900">
            {editing ? 'Cancelar' : 'Editar limite'}
          </Text>
        </Pressable>
        <Pressable
          testID={`orcamento-remover-${budget.id}`}
          onPress={onRemove}
          className="flex-row items-center gap-1 rounded-lg border border-neutral-300 bg-white px-3 py-1"
        >
          <Trash2 size={14} color="#0f172a" />
          <Text className="text-xs font-medium text-neutral-900">Remover</Text>
        </Pressable>
      </View>

      {editing && (
        <View className="mt-3">
          <Text className="text-xs font-medium text-neutral-700">Novo limite</Text>
          <TextInput
            testID={`orcamento-limite-input-${budget.id}`}
            className="mt-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-neutral-900"
            keyboardType="decimal-pad"
            value={limit}
            onChangeText={setLimit}
          />
          <Pressable
            testID={`orcamento-limite-salvar-${budget.id}`}
            disabled={busy}
            onPress={save}
            className={`mt-2 flex-row items-center justify-center gap-1 rounded-lg bg-brand-600 px-4 py-2 ${busy ? 'opacity-50' : ''}`}
          >
            <Check size={14} color="white" />
            <Text className="text-sm font-medium text-white">{busy ? 'Salvando...' : 'Salvar'}</Text>
          </Pressable>
          {error && <Text className="mt-2 text-sm text-danger-700">{error}</Text>}
        </View>
      )}
    </View>
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

  async function submit() {
    if (!spaceId || !amountLimit.trim()) return;
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
    <View className="mt-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <Text className="text-base font-semibold text-neutral-900">Novo orcamento</Text>
      <Text className="mt-0.5 text-xs text-neutral-500">
        O limite vale para o mes selecionado. Sem categoria, vale para todas as despesas.
      </Text>

      {error && (
        <Text className="mt-3 rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-700">{error}</Text>
      )}

      <Text className="mt-3 text-xs font-medium text-neutral-700">Categoria</Text>
      <View className="mt-1 flex-row flex-wrap gap-2">
        <Pressable
          testID="orcamento-categoria"
          onPress={() => setCategoryId('')}
          className={`rounded-full border px-3 py-1 ${categoryId === '' ? 'border-brand-500 bg-brand-50' : 'border-neutral-200 bg-white'}`}
        >
          <Text className={`text-xs font-medium ${categoryId === '' ? 'text-brand-700' : 'text-neutral-700'}`}>
            Geral
          </Text>
        </Pressable>
        {categories.map((c) => (
          <Pressable
            key={c.id}
            testID={`orcamento-categoria-${c.id}`}
            onPress={() => setCategoryId(c.id)}
            className={`rounded-full border px-3 py-1 ${categoryId === c.id ? 'border-brand-500 bg-brand-50' : 'border-neutral-200 bg-white'}`}
          >
            <Text className={`text-xs font-medium ${categoryId === c.id ? 'text-brand-700' : 'text-neutral-700'}`}>
              {c.name}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text className="mt-3 text-xs font-medium text-neutral-700">Limite</Text>
      <TextInput
        testID="orcamento-limite"
        className="mt-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-neutral-900"
        placeholder="Ex.: 1000.00"
        placeholderTextColor="#94a3b8"
        keyboardType="decimal-pad"
        value={amountLimit}
        onChangeText={setAmountLimit}
      />

      <Pressable
        testID="orcamento-salvar"
        disabled={busy || !amountLimit.trim()}
        onPress={submit}
        className={`mt-4 rounded-lg bg-brand-600 px-4 py-2.5 ${busy || !amountLimit.trim() ? 'opacity-50' : ''}`}
      >
        <Text className="text-center text-sm font-medium text-white">
          {busy ? 'Criando...' : 'Criar orcamento'}
        </Text>
      </Pressable>
    </View>
  );
}

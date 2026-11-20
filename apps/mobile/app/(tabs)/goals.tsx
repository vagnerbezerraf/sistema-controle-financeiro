import { useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, RefreshControl } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../src/auth/AuthContext';
import { apiFetch } from '../../src/lib/api';
import type {
  CreateGoalRequest,
  GoalProgress,
  GoalsView,
  GoalStatus,
} from '@scf/api-contracts';
import { Check, Plus, Target, Trash2, X } from 'lucide-react-native';

function formatCurrency(n: string | number) {
  const v = typeof n === 'string' ? Number(n) : n;
  return isFinite(v) ? `R$ ${v.toFixed(2).replace('.', ',')}` : '-';
}

function formatDate(iso: string) {
  if (!iso) return '-';
  const d = iso.includes('T') ? new Date(iso) : new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('pt-BR');
}

function formatPercent(n: number) {
  return isFinite(n) ? `${n.toFixed(1).replace('.', ',')}%` : '-';
}

function statusLabel(status: GoalStatus): string {
  switch (status) {
    case 'achieved':
      return 'Atingida';
    case 'overdue':
      return 'Atrasada';
    default:
      return 'Em andamento';
  }
}

function statusBadge(status: GoalStatus): string {
  switch (status) {
    case 'achieved':
      return 'bg-success-50 text-success-700';
    case 'overdue':
      return 'bg-danger-50 text-danger-700';
    default:
      return 'bg-brand-50 text-brand-700';
  }
}

function statusBar(status: GoalStatus): string {
  switch (status) {
    case 'achieved':
      return 'bg-success-500';
    case 'overdue':
      return 'bg-danger-500';
    default:
      return 'bg-brand-500';
  }
}

export default function GoalsScreen() {
  const { currentSpaceId } = useAuth();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const goalsQ = useQuery({
    queryKey: ['goals', currentSpaceId],
    enabled: !!currentSpaceId,
    queryFn: () => apiFetch<GoalsView>(`/financial-spaces/${currentSpaceId}/goals`),
  });

  const view = goalsQ.data;
  const items = view?.items ?? [];

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ['goals', currentSpaceId] });
  }

  async function contribute(goal: GoalProgress, amount: string) {
    if (!currentSpaceId) return;
    await apiFetch(`/financial-spaces/${currentSpaceId}/goals/${goal.id}/contributions`, {
      method: 'POST',
      json: { amount },
    });
    await refresh();
  }

  async function updateTarget(goal: GoalProgress, targetAmount: string) {
    if (!currentSpaceId) return;
    await apiFetch(`/financial-spaces/${currentSpaceId}/goals/${goal.id}`, {
      method: 'PATCH',
      json: { targetAmount },
    });
    await refresh();
  }

  async function removeGoal(goal: GoalProgress) {
    if (!currentSpaceId) return;
    await apiFetch(`/financial-spaces/${currentSpaceId}/goals/${goal.id}`, { method: 'DELETE' });
    await refresh();
  }

  return (
    <ScrollView
      className="flex-1 bg-neutral-50"
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={goalsQ.isFetching}
          onRefresh={() => goalsQ.refetch()}
          tintColor="#1e57f5"
        />
      }
    >
      <View className="flex-row items-start justify-between">
        <View className="flex-1">
          <Text className="text-2xl font-bold text-neutral-900">Metas</Text>
          <Text className="text-sm text-neutral-500">
            Valores-alvo, acumulado das contribuicoes e prazo de cada meta.
          </Text>
        </View>
        <Pressable
          testID="meta-nova"
          onPress={() => setShowCreate((v) => !v)}
          className="ml-3 flex-row items-center gap-1 rounded-lg bg-brand-600 px-3 py-2"
        >
          {showCreate ? <X size={16} color="white" /> : <Plus size={16} color="white" />}
          <Text className="text-sm font-medium text-white">{showCreate ? 'Cancelar' : 'Nova'}</Text>
        </Pressable>
      </View>

      {showCreate && (
        <GoalForm
          spaceId={currentSpaceId}
          onCreated={async () => {
            setShowCreate(false);
            await refresh();
          }}
        />
      )}

      <View className="mt-5 flex-row gap-3">
        <View testID="metas-total-alvo" className="flex-1 rounded-xl border border-neutral-200 bg-white p-3 shadow-sm">
          <Text className="text-xs uppercase text-neutral-500">Alvo total</Text>
          <Text className="mt-1 text-base font-semibold text-neutral-900">
            {formatCurrency(Number(view?.totals.targetAmount ?? 0))}
          </Text>
        </View>
        <View testID="metas-total-acumulado" className="flex-1 rounded-xl border border-neutral-200 bg-white p-3 shadow-sm">
          <Text className="text-xs uppercase text-neutral-500">Acumulado</Text>
          <Text className="mt-1 text-base font-semibold text-brand-700">
            {formatCurrency(Number(view?.totals.currentAmount ?? 0))}
          </Text>
        </View>
        <View testID="metas-total-falta" className="flex-1 rounded-xl border border-neutral-200 bg-white p-3 shadow-sm">
          <Text className="text-xs uppercase text-neutral-500">Falta</Text>
          <Text
            className={`mt-1 text-base font-semibold ${
              Number(view?.totals.remainingAmount ?? 0) < 0 ? 'text-success-700' : 'text-neutral-900'
            }`}
          >
            {formatCurrency(Number(view?.totals.remainingAmount ?? 0))}
          </Text>
        </View>
      </View>

      <View className="mt-5 rounded-xl border border-neutral-200 bg-white shadow-sm">
        <View className="border-b border-neutral-100 p-4">
          <Text className="text-base font-semibold text-neutral-900">Suas metas</Text>
          <Text className="mt-0.5 text-xs text-neutral-500">
            Contribuicoes incrementam o acumulado; a meta e atingida ao alcancar o alvo
          </Text>
        </View>
        <View className="p-4 space-y-4">
          {goalsQ.isLoading && <Text className="text-sm text-neutral-500">Carregando...</Text>}
          {!goalsQ.isLoading && items.length === 0 && (
            <View className="flex-row items-center gap-3">
              <Target size={18} color="#94a3b8" />
              <Text className="flex-1 text-sm text-neutral-600">
                Nenhuma meta cadastrada. Crie a primeira em Nova.
              </Text>
            </View>
          )}
          {items.map((goal) => (
            <GoalRow
              key={goal.id}
              goal={goal}
              onContribute={(amount) => contribute(goal, amount)}
              onUpdateTarget={(target) => updateTarget(goal, target)}
              onRemove={() => removeGoal(goal)}
            />
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

function GoalRow({
  goal,
  onContribute,
  onUpdateTarget,
  onRemove,
}: {
  goal: GoalProgress;
  onContribute: (amount: string) => Promise<void>;
  onUpdateTarget: (target: string) => Promise<void>;
  onRemove: () => void;
}) {
  const [mode, setMode] = useState<'idle' | 'contribute' | 'target'>('idle');
  const [amount, setAmount] = useState('');
  const [target, setTarget] = useState(goal.targetAmount);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitContribution() {
    setError(null);
    setBusy(true);
    try {
      await onContribute(amount.trim());
      setAmount('');
      setMode('idle');
    } catch (e: any) {
      setError(e?.details?.message ?? e?.message ?? 'Nao foi possivel registrar a contribuicao');
    } finally {
      setBusy(false);
    }
  }

  async function submitTarget() {
    setError(null);
    setBusy(true);
    try {
      await onUpdateTarget(target.trim());
      setMode('idle');
    } catch (e: any) {
      setError(e?.details?.message ?? e?.message ?? 'Nao foi possivel atualizar o alvo');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View testID={`meta-${goal.id}`} className="border-b border-neutral-100 pb-4">
      <View className="flex-row items-center justify-between">
        <View className="flex-1 pr-3">
          <View className="flex-row items-center gap-2">
            <Text className="font-medium text-neutral-900">{goal.name}</Text>
            <Text
              testID={`meta-status-${goal.id}`}
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge(goal.status)}`}
            >
              {statusLabel(goal.status)}
            </Text>
          </View>
          <Text className="text-xs text-neutral-500">
            {formatCurrency(goal.currentAmount)} de {formatCurrency(goal.targetAmount)} ·{' '}
            {formatPercent(goal.progressPercent)}
            {goal.deadline ? ` · prazo ${formatDate(goal.deadline)}` : ''}
          </Text>
        </View>
        <Text
          testID={`meta-saldo-${goal.id}`}
          className={`text-sm font-semibold ${
            Number(goal.remainingAmount) <= 0 ? 'text-success-700' : 'text-neutral-900'
          }`}
        >
          {formatCurrency(goal.remainingAmount)}
        </Text>
      </View>

      <View className="mt-3 h-2 w-full overflow-hidden rounded-full bg-neutral-100">
        <View
          testID={`meta-progresso-${goal.id}`}
          className={`h-full rounded-full ${statusBar(goal.status)}`}
          style={{ width: `${Math.min(goal.progressPercent, 100)}%` }}
        />
      </View>

      <View className="mt-3 flex-row flex-wrap items-center gap-2">
        <Pressable
          testID={`meta-contribuir-${goal.id}`}
          onPress={() => {
            setMode(mode === 'contribute' ? 'idle' : 'contribute');
            setError(null);
          }}
          className="rounded-lg border border-neutral-300 bg-white px-3 py-1"
        >
          <Text className="text-xs font-medium text-neutral-900">Contribuir</Text>
        </Pressable>
        <Pressable
          testID={`meta-editar-${goal.id}`}
          onPress={() => {
            setTarget(goal.targetAmount);
            setMode(mode === 'target' ? 'idle' : 'target');
            setError(null);
          }}
          className="rounded-lg border border-neutral-300 bg-white px-3 py-1"
        >
          <Text className="text-xs font-medium text-neutral-900">
            {mode === 'target' ? 'Cancelar' : 'Editar alvo'}
          </Text>
        </Pressable>
        <Pressable
          testID={`meta-remover-${goal.id}`}
          onPress={onRemove}
          className="flex-row items-center gap-1 rounded-lg border border-neutral-300 bg-white px-3 py-1"
        >
          <Trash2 size={14} color="#0f172a" />
          <Text className="text-xs font-medium text-neutral-900">Remover</Text>
        </Pressable>
      </View>

      {mode === 'contribute' && (
        <View className="mt-3">
          <Text className="text-xs font-medium text-neutral-700">Valor da contribuicao</Text>
          <TextInput
            testID={`meta-contribuicao-input-${goal.id}`}
            className="mt-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-neutral-900"
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={setAmount}
          />
          <Pressable
            testID={`meta-contribuicao-salvar-${goal.id}`}
            disabled={busy || !amount.trim()}
            onPress={submitContribution}
            className={`mt-2 flex-row items-center justify-center gap-1 rounded-lg bg-brand-600 px-4 py-2 ${busy || !amount.trim() ? 'opacity-50' : ''}`}
          >
            <Check size={14} color="white" />
            <Text className="text-sm font-medium text-white">{busy ? 'Registrando...' : 'Registrar'}</Text>
          </Pressable>
          {error && <Text className="mt-2 text-sm text-danger-700">{error}</Text>}
        </View>
      )}

      {mode === 'target' && (
        <View className="mt-3">
          <Text className="text-xs font-medium text-neutral-700">Novo alvo</Text>
          <TextInput
            testID={`meta-alvo-input-${goal.id}`}
            className="mt-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-neutral-900"
            keyboardType="decimal-pad"
            value={target}
            onChangeText={setTarget}
          />
          <Pressable
            testID={`meta-alvo-salvar-${goal.id}`}
            disabled={busy || !target.trim()}
            onPress={submitTarget}
            className={`mt-2 flex-row items-center justify-center gap-1 rounded-lg bg-brand-600 px-4 py-2 ${busy || !target.trim() ? 'opacity-50' : ''}`}
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

function GoalForm({ spaceId, onCreated }: { spaceId: string | null; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [deadline, setDeadline] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!spaceId || !name.trim() || !targetAmount.trim()) return;
    setError(null);
    setBusy(true);
    try {
      const body: CreateGoalRequest = {
        name: name.trim(),
        targetAmount: targetAmount.trim(),
        ...(deadline ? { deadline } : {}),
      };
      await apiFetch(`/financial-spaces/${spaceId}/goals`, { method: 'POST', json: body });
      setName('');
      setTargetAmount('');
      setDeadline('');
      onCreated();
    } catch (e: any) {
      setError(e?.details?.message ?? e?.message ?? 'Nao foi possivel criar a meta');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="mt-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <Text className="text-base font-semibold text-neutral-900">Nova meta</Text>
      <Text className="mt-0.5 text-xs text-neutral-500">
        Informe o valor-alvo e, se quiser, um prazo. O acumulado cresce com as contribuicoes.
      </Text>

      {error && (
        <Text className="mt-3 rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-700">{error}</Text>
      )}

      <Text className="mt-3 text-xs font-medium text-neutral-700">Nome</Text>
      <TextInput
        testID="meta-nome"
        className="mt-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-neutral-900"
        placeholder="Ex.: Reserva de emergencia"
        placeholderTextColor="#94a3b8"
        value={name}
        onChangeText={setName}
      />

      <Text className="mt-3 text-xs font-medium text-neutral-700">Valor-alvo</Text>
      <TextInput
        testID="meta-alvo"
        className="mt-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-neutral-900"
        placeholder="Ex.: 10000.00"
        placeholderTextColor="#94a3b8"
        keyboardType="decimal-pad"
        value={targetAmount}
        onChangeText={setTargetAmount}
      />

      <Text className="mt-3 text-xs font-medium text-neutral-700">Prazo (opcional)</Text>
      <TextInput
        testID="meta-prazo"
        className="mt-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-neutral-900"
        placeholder="AAAA-MM-DD"
        placeholderTextColor="#94a3b8"
        value={deadline}
        onChangeText={setDeadline}
      />

      <Pressable
        testID="meta-salvar"
        disabled={busy || !name.trim() || !targetAmount.trim()}
        onPress={submit}
        className={`mt-4 rounded-lg bg-brand-600 px-4 py-2.5 ${busy || !name.trim() || !targetAmount.trim() ? 'opacity-50' : ''}`}
      >
        <Text className="text-center text-sm font-medium text-white">
          {busy ? 'Criando...' : 'Criar meta'}
        </Text>
      </Pressable>
    </View>
  );
}

import { useMemo, useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, RefreshControl } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../src/auth/AuthContext';
import { apiFetch } from '../../src/lib/api';
import type {
  Obligation,
  ObligationStatus,
  Paginated,
  RecurrenceRule,
  RecurrenceFrequency,
  Transaction,
  CreateObligationRequest,
  CreateRecurrenceRequest,
} from '@scf/api-contracts';
import { CalendarClock, Plus, RefreshCw, X } from 'lucide-react-native';

/** Situacoes em aberto: ainda podem ser vencidas, conciliadas ou canceladas. */
const OPEN_STATUSES: ObligationStatus[] = ['forecast', 'pending', 'partially_reconciled'];

function formatCurrency(n: string | number) {
  const v = typeof n === 'string' ? Number(n) : n;
  return isFinite(v) ? `R$ ${v.toFixed(2).replace('.', ',')}` : '-';
}

function formatDate(iso: string) {
  if (!iso) return '-';
  const d = iso.includes('T') ? new Date(iso) : new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('pt-BR');
}

function statusLabel(o: Obligation): string {
  if (o.overdue) return 'Vencida';
  switch (o.status) {
    case 'forecast': return 'Prevista';
    case 'pending': return 'Em aberto';
    case 'partially_reconciled': return 'Parcial';
    case 'reconciled': return 'Conciliada';
    case 'ignored': return 'Ignorada';
    case 'canceled': return 'Cancelada';
    default: return o.status;
  }
}

function statusBadge(o: Obligation): string {
  if (o.overdue) return 'bg-warning-50 text-warning-700';
  switch (o.status) {
    case 'reconciled': return 'bg-success-50 text-success-700';
    case 'partially_reconciled': return 'bg-brand-50 text-brand-700';
    case 'canceled':
    case 'ignored': return 'bg-neutral-100 text-neutral-600';
    default: return 'bg-neutral-100 text-neutral-700';
  }
}

const FREQUENCY_LABEL: Record<RecurrenceFrequency, string> = {
  daily: 'Diaria',
  weekly: 'Semanal',
  monthly: 'Mensal',
  yearly: 'Anual',
};

export default function ObligationsScreen() {
  const { currentSpaceId } = useAuth();
  const qc = useQueryClient();

  const [type, setType] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);

  const params = useMemo(() => {
    const sp = new URLSearchParams();
    if (type) sp.set('type', type);
    if (overdueOnly) sp.set('overdue', 'true');
    return sp.toString();
  }, [type, overdueOnly]);

  const obligationsQ = useQuery({
    queryKey: ['obligations', currentSpaceId, params],
    enabled: !!currentSpaceId,
    queryFn: () => apiFetch<Obligation[]>(`/financial-spaces/${currentSpaceId}/obligations?${params}`),
  });
  const rulesQ = useQuery({
    queryKey: ['recurrences', currentSpaceId],
    enabled: !!currentSpaceId,
    queryFn: () => apiFetch<RecurrenceRule[]>(`/financial-spaces/${currentSpaceId}/recurrences`),
  });

  const obligations = useMemo(() => obligationsQ.data ?? [], [obligationsQ.data]);
  const rules = rulesQ.data ?? [];

  const summary = useMemo(() => {
    const open = obligations.filter((o) => OPEN_STATUSES.includes(o.status));
    const sum = (list: Obligation[]) => list.reduce((acc, o) => acc + Number(o.amount), 0);
    return {
      payable: sum(open.filter((o) => o.type === 'expense')),
      receivable: sum(open.filter((o) => o.type === 'income')),
      overdue: open.filter((o) => o.overdue).length,
    };
  }, [obligations]);

  const [showCreate, setShowCreate] = useState(false);
  const [showRecurrence, setShowRecurrence] = useState(false);
  const [reconcileId, setReconcileId] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  async function refresh() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['obligations', currentSpaceId] }),
      qc.invalidateQueries({ queryKey: ['recurrences', currentSpaceId] }),
    ]);
  }

  async function changeStatus(obligation: Obligation, next: 'canceled' | 'ignored') {
    if (!currentSpaceId) return;
    try {
      await apiFetch(`/financial-spaces/${currentSpaceId}/obligations/${obligation.id}`, {
        method: 'PATCH',
        json: { status: next, version: obligation.version },
      });
      await refresh();
    } catch (e: any) {
      setFlash(e?.details?.message ?? e?.message ?? 'Nao foi possivel atualizar a conta');
    }
  }

  async function generate(rule: RecurrenceRule) {
    if (!currentSpaceId) return;
    try {
      const res = await apiFetch<{ generatedCount: number }>(
        `/financial-spaces/${currentSpaceId}/recurrences/${rule.id}/generate`,
        { method: 'POST', json: {} },
      );
      setFlash(
        res.generatedCount > 0
          ? `${res.generatedCount} nova(s) previsao(oes) gerada(s).`
          : 'Nenhuma previsao nova: a agenda ja estava materializada.',
      );
      await refresh();
    } catch (e: any) {
      setFlash(e?.details?.message ?? e?.message ?? 'Nao foi possivel gerar as previsoes');
    }
  }

  const typeFilters: Array<{ value: string; label: string; testID: string }> = [
    { value: '', label: 'Todas', testID: 'filtro-tipo-todas' },
    { value: 'expense', label: 'A pagar', testID: 'filtro-tipo-expense' },
    { value: 'income', label: 'A receber', testID: 'filtro-tipo-income' },
  ];

  return (
    <ScrollView
      className="flex-1 bg-neutral-50"
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={obligationsQ.isFetching || rulesQ.isFetching}
          onRefresh={() => { obligationsQ.refetch(); rulesQ.refetch(); }}
          tintColor="#1e57f5"
        />
      }
    >
      <View className="flex-row items-start justify-between">
        <View className="flex-1">
          <Text className="text-2xl font-bold text-neutral-900">Contas a pagar e receber</Text>
          <Text className="text-sm text-neutral-500">Previsoes que nao distorcem o saldo.</Text>
        </View>
        <Pressable
          testID="nova-conta"
          onPress={() => { setShowCreate((v) => !v); setShowRecurrence(false); }}
          className="ml-3 flex-row items-center gap-1 rounded-lg bg-brand-600 px-3 py-2"
        >
          {showCreate ? <X size={16} color="white" /> : <Plus size={16} color="white" />}
          <Text className="text-sm font-medium text-white">{showCreate ? 'Cancelar' : 'Nova'}</Text>
        </Pressable>
      </View>

      <View className="mt-3 flex-row gap-2">
        <Pressable
          testID="nova-recorrencia"
          onPress={() => { setShowRecurrence((v) => !v); setShowCreate(false); }}
          className="flex-row items-center gap-1 rounded-lg border border-neutral-300 bg-white px-3 py-2"
        >
          {showRecurrence ? <X size={16} color="#0f172a" /> : <RefreshCw size={16} color="#0f172a" />}
          <Text className="text-sm font-medium text-neutral-900">
            {showRecurrence ? 'Cancelar' : 'Nova recorrencia'}
          </Text>
        </Pressable>
      </View>

      {flash && (
        <Text className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">{flash}</Text>
      )}

      {showCreate && (
        <ObligationForm
          spaceId={currentSpaceId}
          onCreated={async () => { setShowCreate(false); await refresh(); }}
        />
      )}

      {showRecurrence && (
        <RecurrenceForm
          spaceId={currentSpaceId}
          onCreated={async (generatedCount) => {
            setShowRecurrence(false);
            setFlash(`${generatedCount} previsao(oes) criada(s) pela recorrencia.`);
            await refresh();
          }}
        />
      )}

      <View className="mt-5 flex-row gap-3">
        <View className="flex-1 rounded-xl border border-neutral-200 bg-white p-3 shadow-sm">
          <Text className="text-xs uppercase text-neutral-500">A pagar</Text>
          <Text className="mt-1 text-lg font-semibold text-danger-700">{formatCurrency(summary.payable)}</Text>
        </View>
        <View className="flex-1 rounded-xl border border-neutral-200 bg-white p-3 shadow-sm">
          <Text className="text-xs uppercase text-neutral-500">A receber</Text>
          <Text className="mt-1 text-lg font-semibold text-success-700">{formatCurrency(summary.receivable)}</Text>
        </View>
        <View className="flex-1 rounded-xl border border-neutral-200 bg-white p-3 shadow-sm">
          <Text className="text-xs uppercase text-neutral-500">Vencidas</Text>
          <Text className="mt-1 text-lg font-semibold text-warning-700">{summary.overdue}</Text>
        </View>
      </View>

      <View className="mt-5 flex-row flex-wrap items-center gap-2">
        {typeFilters.map((f) => (
          <Pressable
            key={f.testID}
            testID={f.testID}
            onPress={() => setType(f.value)}
            className={`rounded-full border px-3 py-1 ${type === f.value ? 'border-brand-500 bg-brand-50' : 'border-neutral-200 bg-white'}`}
          >
            <Text className={`text-xs font-medium ${type === f.value ? 'text-brand-700' : 'text-neutral-700'}`}>
              {f.label}
            </Text>
          </Pressable>
        ))}
        <Pressable
          testID="filtro-vencidas"
          onPress={() => setOverdueOnly((v) => !v)}
          className={`rounded-full border px-3 py-1 ${overdueOnly ? 'border-warning-400 bg-warning-50' : 'border-neutral-200 bg-white'}`}
        >
          <Text className={`text-xs font-medium ${overdueOnly ? 'text-warning-700' : 'text-neutral-700'}`}>
            Somente vencidas
          </Text>
        </Pressable>
      </View>

      <View className="mt-4 rounded-xl border border-neutral-200 bg-white shadow-sm">
        <View className="border-b border-neutral-100 p-4">
          <Text className="text-base font-semibold text-neutral-900">Vencimentos</Text>
          <Text className="mt-0.5 text-xs text-neutral-500">Mais proximos primeiro</Text>
        </View>
        <View className="p-4 space-y-3">
          {obligationsQ.isLoading && <Text className="text-sm text-neutral-500">Carregando...</Text>}
          {!obligationsQ.isLoading && obligations.length === 0 && (
            <View className="flex-row items-center gap-3">
              <CalendarClock size={18} color="#94a3b8" />
              <Text className="flex-1 text-sm text-neutral-600">
                Nenhuma conta nesse filtro. Crie uma conta avulsa ou uma recorrencia.
              </Text>
            </View>
          )}
          {obligations.map((o) => (
            <View key={o.id} testID={`conta-${o.id}`} className="border-b border-neutral-100 pb-3">
              <View className="flex-row items-center justify-between">
                <View className="flex-1 pr-3">
                  <View className="flex-row items-center gap-2">
                    <Text className="font-medium text-neutral-900">{o.description}</Text>
                    {o.recurrenceRuleId && (
                      <Text className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-600">
                        recorrente
                      </Text>
                    )}
                  </View>
                  <Text className="text-xs text-neutral-500">
                    vence {formatDate(o.dueDate)} · {o.type === 'income' ? 'a receber' : 'a pagar'}
                  </Text>
                </View>
                <Text className={`font-semibold ${o.type === 'income' ? 'text-success-700' : 'text-neutral-900'}`}>
                  {formatCurrency(o.amount)}
                </Text>
              </View>
              <View className="mt-2 flex-row items-center gap-2">
                <Text className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge(o)}`}>
                  {statusLabel(o)}
                </Text>
                {OPEN_STATUSES.includes(o.status) && (
                  <>
                    <Pressable
                      testID={`conciliar-${o.id}`}
                      onPress={() => setReconcileId(o.id)}
                      className="rounded-lg border border-neutral-300 bg-white px-3 py-1"
                    >
                      <Text className="text-xs font-medium text-neutral-900">Conciliar</Text>
                    </Pressable>
                    <Pressable
                      testID={`cancelar-${o.id}`}
                      onPress={() => changeStatus(o, 'canceled')}
                      className="rounded-lg border border-neutral-300 bg-white px-3 py-1"
                    >
                      <Text className="text-xs font-medium text-neutral-900">Cancelar</Text>
                    </Pressable>
                  </>
                )}
              </View>

              {reconcileId === o.id && (
                <ReconcilePanel
                  spaceId={currentSpaceId}
                  obligation={o}
                  onClose={() => setReconcileId(null)}
                  onDone={async () => {
                    setReconcileId(null);
                    setFlash('Conta conciliada.');
                    await refresh();
                  }}
                />
              )}
            </View>
          ))}
        </View>
      </View>

      <View className="mt-5 rounded-xl border border-neutral-200 bg-white shadow-sm">
        <View className="border-b border-neutral-100 p-4">
          <Text className="text-base font-semibold text-neutral-900">Recorrencias</Text>
          <Text className="mt-0.5 text-xs text-neutral-500">Agendas que geram contas previstas</Text>
        </View>
        <View className="p-4 space-y-3">
          {rules.length === 0 && (
            <Text className="text-sm text-neutral-500">
              Nenhuma recorrencia. Use o botao Nova recorrencia para agendar contas fixas.
            </Text>
          )}
          {rules.map((r) => (
            <View key={r.id} testID={`regra-${r.id}`} className="border-b border-neutral-100 pb-3">
              <View className="flex-row items-center justify-between">
                <View className="flex-1 pr-3">
                  <Text className="font-medium text-neutral-900">{r.template.description}</Text>
                  <Text className="text-xs text-neutral-500">
                    {FREQUENCY_LABEL[r.frequency].toLowerCase()} · inicio {formatDate(r.startDate)}
                    {r.occurrencesLimit ? ` · limite ${r.occurrencesLimit}` : ''}
                  </Text>
                </View>
                <Text className="font-semibold text-neutral-900">{formatCurrency(r.template.amount)}</Text>
              </View>
              <View className="mt-2 flex-row items-center gap-2">
                <Text className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.state === 'active' ? 'bg-success-50 text-success-700' : 'bg-neutral-100 text-neutral-600'}`}>
                  {r.state === 'active' ? 'Ativa' : 'Arquivada'}
                </Text>
                <Pressable
                  testID={`gerar-${r.id}`}
                  disabled={r.state !== 'active'}
                  onPress={() => generate(r)}
                  className={`rounded-lg border border-neutral-300 bg-white px-3 py-1 ${r.state !== 'active' ? 'opacity-50' : ''}`}
                >
                  <Text className="text-xs font-medium text-neutral-900">Gerar</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

function TypeToggle({ value, onChange, testID }: { value: 'expense' | 'income'; onChange: (v: 'expense' | 'income') => void; testID: string }) {
  return (
    <View className="mt-1 flex-row gap-2">
      <Pressable
        testID={testID}
        onPress={() => onChange('expense')}
        className={`flex-1 rounded-lg border px-3 py-2 ${value === 'expense' ? 'border-brand-500 bg-brand-50' : 'border-neutral-200 bg-white'}`}
      >
        <Text className={`text-center text-sm ${value === 'expense' ? 'text-brand-700' : 'text-neutral-700'}`}>A pagar</Text>
      </Pressable>
      <Pressable
        testID={`${testID}-receber`}
        onPress={() => onChange('income')}
        className={`flex-1 rounded-lg border px-3 py-2 ${value === 'income' ? 'border-brand-500 bg-brand-50' : 'border-neutral-200 bg-white'}`}
      >
        <Text className={`text-center text-sm ${value === 'income' ? 'text-brand-700' : 'text-neutral-700'}`}>A receber</Text>
      </Pressable>
    </View>
  );
}

function ObligationForm({ spaceId, onCreated }: { spaceId: string | null; onCreated: () => void }) {
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!spaceId || !description.trim() || !amount.trim() || !dueDate.trim()) return;
    setError(null);
    setBusy(true);
    try {
      const body: CreateObligationRequest = {
        type,
        description: description.trim(),
        amount: amount.trim(),
        dueDate: dueDate.trim(),
      };
      await apiFetch(`/financial-spaces/${spaceId}/obligations`, { method: 'POST', json: body });
      setDescription('');
      setAmount('');
      setDueDate('');
      onCreated();
    } catch (e: any) {
      setError(e?.details?.message ?? e?.message ?? 'Nao foi possivel criar a conta');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="mt-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <Text className="text-base font-semibold text-neutral-900">Nova conta</Text>
      {error && <Text className="mt-3 rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-700">{error}</Text>}

      <Text className="mt-3 text-xs font-medium text-neutral-700">Tipo</Text>
      <TypeToggle value={type} onChange={setType} testID="conta-tipo" />

      <Text className="mt-3 text-xs font-medium text-neutral-700">Descricao</Text>
      <TextInput
        testID="conta-descricao"
        className="mt-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-neutral-900"
        placeholder="Ex.: IPTU 2026"
        placeholderTextColor="#94a3b8"
        value={description}
        onChangeText={setDescription}
      />

      <Text className="mt-3 text-xs font-medium text-neutral-700">Valor</Text>
      <TextInput
        testID="conta-valor"
        className="mt-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-neutral-900"
        placeholder="Ex.: 450.00"
        placeholderTextColor="#94a3b8"
        keyboardType="decimal-pad"
        value={amount}
        onChangeText={setAmount}
      />

      <Text className="mt-3 text-xs font-medium text-neutral-700">Vencimento</Text>
      <TextInput
        testID="conta-vencimento"
        className="mt-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-neutral-900"
        placeholder="AAAA-MM-DD"
        placeholderTextColor="#94a3b8"
        value={dueDate}
        onChangeText={setDueDate}
      />

      <Pressable
        testID="conta-salvar"
        disabled={busy || !description.trim() || !amount.trim() || !dueDate.trim()}
        onPress={submit}
        className={`mt-4 rounded-lg bg-brand-600 px-4 py-2.5 ${busy || !description.trim() || !amount.trim() || !dueDate.trim() ? 'opacity-50' : ''}`}
      >
        <Text className="text-center text-sm font-medium text-white">{busy ? 'Criando...' : 'Criar conta'}</Text>
      </Pressable>
    </View>
  );
}

function RecurrenceForm({
  spaceId,
  onCreated,
}: {
  spaceId: string | null;
  onCreated: (generatedCount: number) => void;
}) {
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<RecurrenceFrequency>('monthly');
  const [startDate, setStartDate] = useState('');
  const [generateUpTo, setGenerateUpTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!spaceId || !description.trim() || !amount.trim() || !startDate.trim()) return;
    setError(null);
    setBusy(true);
    try {
      const body: CreateRecurrenceRequest = {
        frequency,
        interval: 1,
        startDate: startDate.trim(),
        template: { type, description: description.trim(), amount: amount.trim() },
        ...(generateUpTo.trim() ? { generateUpTo: generateUpTo.trim() } : {}),
      };
      const res = await apiFetch<{ generatedCount: number }>(
        `/financial-spaces/${spaceId}/recurrences`,
        { method: 'POST', json: body },
      );
      setDescription('');
      setAmount('');
      setStartDate('');
      setGenerateUpTo('');
      onCreated(res.generatedCount);
    } catch (e: any) {
      setError(e?.details?.message ?? e?.message ?? 'Nao foi possivel criar a recorrencia');
    } finally {
      setBusy(false);
    }
  }

  const frequencies: RecurrenceFrequency[] = ['daily', 'weekly', 'monthly', 'yearly'];

  return (
    <View className="mt-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <Text className="text-base font-semibold text-neutral-900">Nova recorrencia</Text>
      <Text className="mt-0.5 text-xs text-neutral-500">
        Gera as contas previstas ate o horizonte (padrao: hoje + 12 meses).
      </Text>
      {error && <Text className="mt-3 rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-700">{error}</Text>}

      <Text className="mt-3 text-xs font-medium text-neutral-700">Tipo</Text>
      <TypeToggle value={type} onChange={setType} testID="recorrencia-tipo" />

      <Text className="mt-3 text-xs font-medium text-neutral-700">Descricao</Text>
      <TextInput
        testID="recorrencia-descricao"
        className="mt-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-neutral-900"
        placeholder="Ex.: Aluguel"
        placeholderTextColor="#94a3b8"
        value={description}
        onChangeText={setDescription}
      />

      <Text className="mt-3 text-xs font-medium text-neutral-700">Valor</Text>
      <TextInput
        testID="recorrencia-valor"
        className="mt-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-neutral-900"
        placeholder="Ex.: 1800.00"
        placeholderTextColor="#94a3b8"
        keyboardType="decimal-pad"
        value={amount}
        onChangeText={setAmount}
      />

      <Text className="mt-3 text-xs font-medium text-neutral-700">Frequencia</Text>
      <View className="mt-1 flex-row flex-wrap gap-2">
        {frequencies.map((f) => (
          <Pressable
            key={f}
            testID={`recorrencia-frequencia-${f}`}
            onPress={() => setFrequency(f)}
            className={`rounded-full border px-3 py-1 ${frequency === f ? 'border-brand-500 bg-brand-50' : 'border-neutral-200 bg-white'}`}
          >
            <Text className={`text-xs font-medium ${frequency === f ? 'text-brand-700' : 'text-neutral-700'}`}>
              {FREQUENCY_LABEL[f]}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text className="mt-3 text-xs font-medium text-neutral-700">Inicio</Text>
      <TextInput
        testID="recorrencia-inicio"
        className="mt-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-neutral-900"
        placeholder="AAAA-MM-DD"
        placeholderTextColor="#94a3b8"
        value={startDate}
        onChangeText={setStartDate}
      />

      <Text className="mt-3 text-xs font-medium text-neutral-700">Gerar previsoes ate (opcional)</Text>
      <TextInput
        testID="recorrencia-horizonte"
        className="mt-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-neutral-900"
        placeholder="AAAA-MM-DD"
        placeholderTextColor="#94a3b8"
        value={generateUpTo}
        onChangeText={setGenerateUpTo}
      />

      <Pressable
        testID="recorrencia-salvar"
        disabled={busy || !description.trim() || !amount.trim() || !startDate.trim()}
        onPress={submit}
        className={`mt-4 rounded-lg bg-brand-600 px-4 py-2.5 ${busy || !description.trim() || !amount.trim() || !startDate.trim() ? 'opacity-50' : ''}`}
      >
        <Text className="text-center text-sm font-medium text-white">{busy ? 'Criando...' : 'Criar recorrencia'}</Text>
      </Pressable>
    </View>
  );
}

function ReconcilePanel({
  spaceId,
  obligation,
  onClose,
  onDone,
}: {
  spaceId: string | null;
  obligation: Obligation;
  onClose: () => void;
  onDone: () => void;
}) {
  const [transactionId, setTransactionId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const transactionsQ = useQuery({
    queryKey: ['transactions-for-reconcile', spaceId, obligation.type],
    enabled: !!spaceId,
    queryFn: () =>
      apiFetch<Paginated<Transaction>>(
        `/financial-spaces/${spaceId}/transactions?type=${obligation.type}&status=confirmed&limit=50`,
      ),
  });
  const options = transactionsQ.data?.items ?? [];

  async function submit() {
    if (!spaceId || !transactionId) return;
    setError(null);
    setBusy(true);
    try {
      await apiFetch(`/financial-spaces/${spaceId}/obligations/${obligation.id}/reconcile`, {
        method: 'POST',
        json: { transactionId },
      });
      onDone();
    } catch (e: any) {
      setError(e?.details?.message ?? e?.message ?? 'Nao foi possivel conciliar');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="mt-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
      <View className="flex-row items-center justify-between">
        <Text className="flex-1 text-sm font-medium text-neutral-900">
          Conciliar com um lancamento confirmado
        </Text>
        <Pressable testID="conciliar-fechar" onPress={onClose} className="rounded-lg border border-neutral-300 bg-white px-3 py-1">
          <X size={16} color="#0f172a" />
        </Pressable>
      </View>
      {error && <Text className="mt-3 rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-700">{error}</Text>}
      <View className="mt-3 space-y-1">
        {options.length === 0 && <Text className="text-xs text-neutral-500">Nenhum lancamento confirmado.</Text>}
        {options.map((t) => (
          <Pressable
            key={t.id}
            testID={`conciliar-lancamento-${t.id}`}
            onPress={() => setTransactionId(t.id)}
            className={`rounded-lg border px-3 py-2 ${transactionId === t.id ? 'border-brand-500 bg-brand-50' : 'border-neutral-200 bg-white'}`}
          >
            <Text className="text-sm text-neutral-900">
              {formatDate(t.effectiveDate)} · {t.description} · {formatCurrency(t.totalAmount)}
            </Text>
          </Pressable>
        ))}
      </View>
      <Pressable
        testID="conciliar-confirmar"
        disabled={busy || !transactionId}
        onPress={submit}
        className={`mt-3 rounded-lg bg-brand-600 px-4 py-2.5 ${busy || !transactionId ? 'opacity-50' : ''}`}
      >
        <Text className="text-center text-sm font-medium text-white">
          {busy ? 'Conciliando...' : 'Confirmar conciliacao'}
        </Text>
      </Pressable>
    </View>
  );
}

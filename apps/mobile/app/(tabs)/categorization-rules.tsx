import { useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, RefreshControl } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../src/auth/AuthContext';
import { apiFetch } from '../../src/lib/api';
import type {
  ApplyCategorizationResult,
  CategorizationRule,
  Category,
  CreateCategorizationRuleRequest,
  RuleMatchType,
} from '@scf/api-contracts';
import { Check, Filter, Plus, Trash2, Wand2, X } from 'lucide-react-native';

const MATCH_TYPE_LABELS: Record<RuleMatchType, string> = {
  contains: 'Contem',
  equals: 'Igual a',
  startsWith: 'Comeca com',
};

const MATCH_TYPES: RuleMatchType[] = ['contains', 'equals', 'startsWith'];

/** Rotulo do filtro de tipo; `null` casa receita e despesa. */
function ruleTypeLabel(type: CategorizationRule['type']): string {
  if (type === 'income') return 'Receita';
  if (type === 'expense') return 'Despesa';
  return 'Receita e despesa';
}

export default function CategorizationRulesScreen() {
  const { currentSpaceId } = useAuth();
  const qc = useQueryClient();

  const [showCreate, setShowCreate] = useState(false);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<ApplyCategorizationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rulesQ = useQuery({
    queryKey: ['categorization-rules', currentSpaceId],
    enabled: !!currentSpaceId,
    queryFn: () =>
      apiFetch<CategorizationRule[]>(`/financial-spaces/${currentSpaceId}/categorization-rules`),
  });

  const categoriesQ = useQuery({
    queryKey: ['categories', currentSpaceId],
    enabled: !!currentSpaceId,
    queryFn: () => apiFetch<Category[]>(`/financial-spaces/${currentSpaceId}/categories`),
  });

  const rules = rulesQ.data ?? [];
  const categories = categoriesQ.data ?? [];

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ['categorization-rules', currentSpaceId] });
  }

  async function removeRule(rule: CategorizationRule) {
    if (!currentSpaceId) return;
    await apiFetch(`/financial-spaces/${currentSpaceId}/categorization-rules/${rule.id}`, {
      method: 'DELETE',
    });
    await refresh();
  }

  async function toggleState(rule: CategorizationRule) {
    if (!currentSpaceId) return;
    await apiFetch(`/financial-spaces/${currentSpaceId}/categorization-rules/${rule.id}`, {
      method: 'PATCH',
      json: { state: rule.state === 'active' ? 'archived' : 'active', version: rule.version },
    });
    await refresh();
  }

  async function applyRules() {
    if (!currentSpaceId) return;
    setError(null);
    setResult(null);
    setApplying(true);
    try {
      const applied = await apiFetch<ApplyCategorizationResult>(
        `/financial-spaces/${currentSpaceId}/categorization-rules/apply`,
        { method: 'POST' },
      );
      setResult(applied);
    } catch (e: any) {
      setError(e?.details?.message ?? e?.message ?? 'Nao foi possivel aplicar as regras');
    } finally {
      setApplying(false);
    }
  }

  return (
    <ScrollView
      className="flex-1 bg-neutral-50"
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={rulesQ.isFetching}
          onRefresh={() => rulesQ.refetch()}
          tintColor="#1e57f5"
        />
      }
    >
      <View className="flex-row items-start justify-between">
        <View className="flex-1">
          <Text className="text-2xl font-bold text-neutral-900">Regras de categorizacao</Text>
          <Text className="text-sm text-neutral-500">
            Categorize lancamentos automaticamente pela descricao. A primeira regra que casar vence.
          </Text>
        </View>
        <Pressable
          testID="regras-nova"
          onPress={() => setShowCreate((v) => !v)}
          className="ml-3 flex-row items-center gap-1 rounded-lg bg-brand-600 px-3 py-2"
        >
          {showCreate ? <X size={16} color="white" /> : <Plus size={16} color="white" />}
          <Text className="text-sm font-medium text-white">{showCreate ? 'Cancelar' : 'Nova'}</Text>
        </Pressable>
      </View>

      <Pressable
        testID="regras-aplicar"
        disabled={applying}
        onPress={applyRules}
        className={`mt-3 flex-row items-center justify-center gap-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 ${applying ? 'opacity-50' : ''}`}
      >
        <Wand2 size={16} color="#0f172a" />
        <Text className="text-sm font-medium text-neutral-900">
          {applying ? 'Aplicando...' : 'Aplicar aos lancamentos'}
        </Text>
      </Pressable>

      {result && (
        <View
          testID="regras-resultado"
          className="mt-3 rounded-lg border border-success-200 bg-success-50 px-3 py-2"
        >
          <Text className="text-sm text-success-700">
            {result.applied} de {result.scanned} lancamentos sem categoria receberam categoria.
          </Text>
        </View>
      )}
      {error && (
        <View className="mt-3 rounded-lg border border-danger-200 bg-danger-50 px-3 py-2">
          <Text className="text-sm text-danger-700">{error}</Text>
        </View>
      )}

      {showCreate && (
        <RuleForm
          spaceId={currentSpaceId}
          categories={categories}
          onCreated={async () => {
            setShowCreate(false);
            await refresh();
          }}
        />
      )}

      <View className="mt-5 rounded-xl border border-neutral-200 bg-white shadow-sm">
        <View className="border-b border-neutral-100 p-4">
          <Text className="text-base font-semibold text-neutral-900">Regras por precedencia</Text>
          <Text className="mt-0.5 text-xs text-neutral-500">Menor prioridade aplica antes</Text>
        </View>
        <View className="p-4">
          {rulesQ.isLoading && <Text className="text-sm text-neutral-500">Carregando...</Text>}
          {!rulesQ.isLoading && rules.length === 0 && (
            <View className="flex-row items-center gap-3">
              <Filter size={18} color="#94a3b8" />
              <Text className="flex-1 text-sm text-neutral-600">
                Nenhuma regra cadastrada. Crie uma para categorizar lancamentos automaticamente.
              </Text>
            </View>
          )}
          {rules.map((rule) => (
            <RuleRow
              key={rule.id}
              rule={rule}
              onToggle={() => toggleState(rule)}
              onRemove={() => removeRule(rule)}
            />
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

function RuleRow({
  rule,
  onToggle,
  onRemove,
}: {
  rule: CategorizationRule;
  onToggle: () => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  return (
    <View testID={`regra-${rule.id}`} className="border-b border-neutral-100 py-4">
      <View className="flex-row items-center gap-2">
        <Text className="font-medium text-neutral-900">{rule.name}</Text>
        <Text
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            rule.state === 'active'
              ? 'bg-success-50 text-success-700'
              : 'bg-neutral-50 text-neutral-600'
          }`}
        >
          {rule.state === 'active' ? 'Ativa' : 'Arquivada'}
        </Text>
      </View>
      <Text className="mt-1 text-xs text-neutral-500">
        {MATCH_TYPE_LABELS[rule.matchType]} &quot;{rule.pattern}&quot; ·{' '}
        {rule.categoryName ?? 'Categoria'} · {ruleTypeLabel(rule.type)} · prioridade {rule.priority}
      </Text>

      <View className="mt-3 flex-row items-center gap-2">
        <Pressable
          testID={`regra-estado-${rule.id}`}
          disabled={busy}
          onPress={() => run(onToggle)}
          className={`rounded-lg border border-neutral-300 bg-white px-3 py-1 ${busy ? 'opacity-50' : ''}`}
        >
          <Text className="text-xs font-medium text-neutral-900">
            {rule.state === 'active' ? 'Arquivar' : 'Reativar'}
          </Text>
        </Pressable>
        <Pressable
          testID={`regra-remover-${rule.id}`}
          disabled={busy}
          onPress={() => run(onRemove)}
          className={`flex-row items-center gap-1 rounded-lg border border-neutral-300 bg-white px-3 py-1 ${busy ? 'opacity-50' : ''}`}
        >
          <Trash2 size={14} color="#0f172a" />
          <Text className="text-xs font-medium text-neutral-900">Remover</Text>
        </Pressable>
      </View>
    </View>
  );
}

function RuleForm({
  spaceId,
  categories,
  onCreated,
}: {
  spaceId: string | null;
  categories: Category[];
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [matchType, setMatchType] = useState<RuleMatchType>('contains');
  const [pattern, setPattern] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [type, setType] = useState<'' | 'income' | 'expense'>('');
  const [priority, setPriority] = useState('100');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasCategories = categories.length > 0;

  async function submit() {
    if (!spaceId || !hasCategories) return;
    setError(null);
    setBusy(true);
    try {
      const body: CreateCategorizationRuleRequest = {
        name: name.trim(),
        matchType,
        pattern: pattern.trim(),
        categoryId,
        ...(type ? { type } : {}),
        ...(priority ? { priority: Number(priority) } : {}),
      };
      await apiFetch(`/financial-spaces/${spaceId}/categorization-rules`, { method: 'POST', json: body });
      setName('');
      setPattern('');
      setCategoryId('');
      setType('');
      setPriority('100');
      onCreated();
    } catch (e: any) {
      setError(e?.details?.message ?? e?.message ?? 'Nao foi possivel criar a regra');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="mt-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <Text className="text-base font-semibold text-neutral-900">Nova regra</Text>
      <Text className="mt-0.5 text-xs text-neutral-500">
        O padrao e comparado com a descricao do lancamento (sem diferenciar maiusculas nem acentos).
      </Text>

      {error && (
        <Text className="mt-3 rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-700">{error}</Text>
      )}

      <Text className="mt-3 text-xs font-medium text-neutral-700">Nome</Text>
      <TextInput
        testID="regra-nome"
        className="mt-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-neutral-900"
        placeholder="Ex.: Mercado"
        placeholderTextColor="#94a3b8"
        value={name}
        onChangeText={setName}
      />

      <Text className="mt-3 text-xs font-medium text-neutral-700">Comparacao</Text>
      <View className="mt-1 flex-row flex-wrap gap-2">
        {MATCH_TYPES.map((option) => (
          <Pressable
            key={option}
            testID={`regra-match-${option}`}
            onPress={() => setMatchType(option)}
            className={`rounded-full border px-3 py-1 ${matchType === option ? 'border-brand-500 bg-brand-50' : 'border-neutral-200 bg-white'}`}
          >
            <Text
              className={`text-xs font-medium ${matchType === option ? 'text-brand-700' : 'text-neutral-700'}`}
            >
              {MATCH_TYPE_LABELS[option]}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text className="mt-3 text-xs font-medium text-neutral-700">Padrao na descricao</Text>
      <TextInput
        testID="regra-padrao"
        className="mt-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-neutral-900"
        placeholder="Ex.: mercado"
        placeholderTextColor="#94a3b8"
        value={pattern}
        onChangeText={setPattern}
      />

      <Text className="mt-3 text-xs font-medium text-neutral-700">Categoria</Text>
      <View className="mt-1 flex-row flex-wrap gap-2">
        {categories.length === 0 && (
          <Text className="text-xs text-neutral-500">Nenhuma categoria disponivel.</Text>
        )}
        {categories.map((c) => (
          <Pressable
            key={c.id}
            testID={`regra-categoria-${c.name}`}
            onPress={() => setCategoryId(c.id)}
            className={`rounded-full border px-3 py-1 ${categoryId === c.id ? 'border-brand-500 bg-brand-50' : 'border-neutral-200 bg-white'}`}
          >
            <Text
              className={`text-xs font-medium ${categoryId === c.id ? 'text-brand-700' : 'text-neutral-700'}`}
            >
              {c.name}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text className="mt-3 text-xs font-medium text-neutral-700">Tipo de lancamento</Text>
      <View className="mt-1 flex-row flex-wrap gap-2">
        <Pressable
          testID="regra-tipo-todos"
          onPress={() => setType('')}
          className={`rounded-full border px-3 py-1 ${type === '' ? 'border-brand-500 bg-brand-50' : 'border-neutral-200 bg-white'}`}
        >
          <Text className={`text-xs font-medium ${type === '' ? 'text-brand-700' : 'text-neutral-700'}`}>
            Receita e despesa
          </Text>
        </Pressable>
        <Pressable
          testID="regra-tipo-expense"
          onPress={() => setType('expense')}
          className={`rounded-full border px-3 py-1 ${type === 'expense' ? 'border-brand-500 bg-brand-50' : 'border-neutral-200 bg-white'}`}
        >
          <Text
            className={`text-xs font-medium ${type === 'expense' ? 'text-brand-700' : 'text-neutral-700'}`}
          >
            Despesa
          </Text>
        </Pressable>
        <Pressable
          testID="regra-tipo-income"
          onPress={() => setType('income')}
          className={`rounded-full border px-3 py-1 ${type === 'income' ? 'border-brand-500 bg-brand-50' : 'border-neutral-200 bg-white'}`}
        >
          <Text
            className={`text-xs font-medium ${type === 'income' ? 'text-brand-700' : 'text-neutral-700'}`}
          >
            Receita
          </Text>
        </Pressable>
      </View>

      <Text className="mt-3 text-xs font-medium text-neutral-700">Prioridade</Text>
      <TextInput
        testID="regra-prioridade"
        className="mt-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-neutral-900"
        keyboardType="number-pad"
        value={priority}
        onChangeText={setPriority}
      />

      <Pressable
        testID="regra-salvar"
        disabled={busy || !hasCategories}
        onPress={submit}
        className={`mt-4 flex-row items-center justify-center gap-1 rounded-lg bg-brand-600 px-4 py-2.5 ${busy || !hasCategories ? 'opacity-50' : ''}`}
      >
        <Check size={16} color="white" />
        <Text className="text-sm font-medium text-white">{busy ? 'Criando...' : 'Criar regra'}</Text>
      </Pressable>
    </View>
  );
}

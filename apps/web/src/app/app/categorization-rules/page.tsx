'use client';
import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/components/auth/AuthContext';
import { apiFetch } from '@/lib/api-client';
import type {
  ApplyCategorizationResult,
  CategorizationRule,
  Category,
  CreateCategorizationRuleRequest,
  RuleMatchType,
} from '@scf/api-contracts';
import { Check, Filter, Plus, Trash2, Wand2, X } from 'lucide-react';

const MATCH_TYPE_LABELS: Record<RuleMatchType, string> = {
  contains: 'Contem',
  equals: 'Igual a',
  startsWith: 'Comeca com',
};

const RULE_TYPE_LABELS: Record<'income' | 'expense', string> = {
  income: 'Receita',
  expense: 'Despesa',
};

export default function CategorizationRulesPage() {
  const { currentSpaceId } = useAuth();
  const qc = useQueryClient();

  const [showCreate, setShowCreate] = useState(false);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<ApplyCategorizationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rulesQ = useQuery({
    queryKey: ['categorization-rules', currentSpaceId],
    enabled: !!currentSpaceId,
    queryFn: () => apiFetch<CategorizationRule[]>(`/financial-spaces/${currentSpaceId}/categorization-rules`),
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
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Regras de categorizacao</h1>
          <p className="text-sm text-neutral-500">
            Categorize lancamentos automaticamente pela descricao. A primeira regra que casar vence.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn-outline"
            data-testid="regras-aplicar"
            onClick={applyRules}
            disabled={applying}
          >
            <Wand2 className="h-4 w-4" /> {applying ? 'Aplicando...' : 'Aplicar aos lancamentos'}
          </button>
          <button
            type="button"
            className={showCreate ? 'btn-outline' : 'btn-primary'}
            data-testid="regra-nova"
            onClick={() => setShowCreate((v) => !v)}
          >
            {showCreate ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showCreate ? 'Cancelar' : 'Nova regra'}
          </button>
        </div>
      </header>

      {result && (
        <div
          data-testid="regras-resultado"
          className="rounded-md border border-success-200 bg-success-50 px-3 py-2 text-sm text-success-700"
        >
          {result.applied} de {result.scanned} lancamentos sem categoria receberam categoria.
        </div>
      )}
      {error && (
        <div className="rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700">
          {error}
        </div>
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

      <section className="card">
        <div className="card-header">
          <h2 className="card-title">Regras por precedencia</h2>
          <p className="card-subtitle">Menor prioridade aplica antes</p>
        </div>
        <div className="card-body">
          {rulesQ.isLoading && <p className="text-sm text-neutral-500">Carregando...</p>}
          {!rulesQ.isLoading && rules.length === 0 && (
            <div className="flex items-center gap-3 text-sm text-neutral-600">
              <Filter className="h-5 w-5 text-neutral-400" />
              Nenhuma regra cadastrada. Crie uma para categorizar lancamentos automaticamente.
            </div>
          )}

          <ul className="divide-y divide-neutral-100">
            {rules.map((rule) => (
              <li key={rule.id} data-testid={`regra-${rule.id}`} className="py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-neutral-900">{rule.name}</span>
                      <span
                        className={`badge ${
                          rule.state === 'active'
                            ? 'border-success-200 bg-success-50 text-success-700'
                            : 'border-neutral-200 bg-neutral-50 text-neutral-600'
                        }`}
                      >
                        {rule.state === 'active' ? 'Ativa' : 'Arquivada'}
                      </span>
                    </div>
                    <div className="text-xs text-neutral-500">
                      {MATCH_TYPE_LABELS[rule.matchType]} &quot;{rule.pattern}&quot; ·{' '}
                      {rule.categoryName ?? 'Categoria'} ·{' '}
                      {rule.type === 'income' || rule.type === 'expense'
                        ? RULE_TYPE_LABELS[rule.type]
                        : 'Receita e despesa'}{' '}
                      · prioridade {rule.priority}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="btn-outline"
                      data-testid={`regra-estado-${rule.id}`}
                      onClick={() => toggleState(rule)}
                    >
                      {rule.state === 'active' ? 'Arquivar' : 'Reativar'}
                    </button>
                    <button
                      type="button"
                      className="btn-outline"
                      data-testid={`regra-remover-${rule.id}`}
                      onClick={() => removeRule(rule)}
                    >
                      <Trash2 className="h-4 w-4" /> Remover
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
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

  const hasCategories = useMemo(() => categories.length > 0, [categories]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!spaceId) return;
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
    <section className="card">
      <div className="card-header">
        <h2 className="card-title text-lg">Nova regra</h2>
        <p className="card-subtitle">
          O padrao e comparado com a descricao do lancamento (sem diferenciar maiusculas nem acentos).
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
            <label htmlFor="ruleName" className="label block">
              Nome
            </label>
            <input
              id="ruleName"
              data-testid="regra-nome"
              className="input mt-1"
              placeholder="Ex.: Mercado"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="ruleCategory" className="label block">
              Categoria
            </label>
            <select
              id="ruleCategory"
              data-testid="regra-categoria"
              className="input mt-1"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              required
              disabled={!hasCategories}
            >
              <option value="">Selecione</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="ruleMatchType" className="label block">
              Comparacao
            </label>
            <select
              id="ruleMatchType"
              data-testid="regra-tipo-match"
              className="input mt-1"
              value={matchType}
              onChange={(e) => setMatchType(e.target.value as RuleMatchType)}
            >
              {(Object.keys(MATCH_TYPE_LABELS) as RuleMatchType[]).map((option) => (
                <option key={option} value={option}>
                  {MATCH_TYPE_LABELS[option]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="rulePattern" className="label block">
              Padrao na descricao
            </label>
            <input
              id="rulePattern"
              data-testid="regra-padrao"
              className="input mt-1"
              placeholder="Ex.: mercado"
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="ruleType" className="label block">
              Tipo de lancamento
            </label>
            <select
              id="ruleType"
              data-testid="regra-tipo"
              className="input mt-1"
              value={type}
              onChange={(e) => setType(e.target.value as '' | 'income' | 'expense')}
            >
              <option value="">Receita e despesa</option>
              <option value="expense">Despesa</option>
              <option value="income">Receita</option>
            </select>
          </div>
          <div>
            <label htmlFor="rulePriority" className="label block">
              Prioridade
            </label>
            <input
              id="rulePriority"
              data-testid="regra-prioridade"
              className="input mt-1"
              inputMode="numeric"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            />
          </div>
        </div>
        <button
          type="submit"
          className="btn-primary"
          data-testid="regra-salvar"
          disabled={busy || !hasCategories}
        >
          {busy ? 'Criando...' : <><Check className="h-4 w-4" /> Criar regra</>}
        </button>
      </form>
    </section>
  );
}

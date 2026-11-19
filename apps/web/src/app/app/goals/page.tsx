'use client';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/components/auth/AuthContext';
import { apiFetch } from '@/lib/api-client';
import { formatCurrency, formatDate, formatPercent, cls } from '@/lib/format';
import type { CreateGoalRequest, GoalProgress, GoalsView, GoalStatus } from '@scf/api-contracts';
import { Check, Plus, Target, Trash2, X } from 'lucide-react';

export default function GoalsPage() {
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
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Metas</h1>
          <p className="text-sm text-neutral-500">
            Valores-alvo, acumulado das contribuicoes e prazo de cada meta.
          </p>
        </div>
        <button
          type="button"
          className={showCreate ? 'btn-outline' : 'btn-primary'}
          data-testid="meta-nova"
          onClick={() => setShowCreate((v) => !v)}
        >
          {showCreate ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showCreate ? 'Cancelar' : 'Nova meta'}
        </button>
      </header>

      {showCreate && (
        <GoalForm
          spaceId={currentSpaceId}
          onCreated={async () => {
            setShowCreate(false);
            await refresh();
          }}
        />
      )}

      <section className="grid gap-4 md:grid-cols-3">
        <SummaryCard
          testid="metas-total-alvo"
          label="Alvo total"
          value={Number(view?.totals.targetAmount ?? 0)}
          tone="text-neutral-900"
        />
        <SummaryCard
          testid="metas-total-acumulado"
          label="Acumulado"
          value={Number(view?.totals.currentAmount ?? 0)}
          tone="text-brand-700"
        />
        <SummaryCard
          testid="metas-total-falta"
          label="Falta para o alvo"
          value={Number(view?.totals.remainingAmount ?? 0)}
          tone={Number(view?.totals.remainingAmount ?? 0) < 0 ? 'text-success-700' : 'text-neutral-900'}
        />
      </section>

      <section className="card">
        <div className="card-header">
          <h2 className="card-title">Suas metas</h2>
          <p className="card-subtitle">Contribuicoes incrementam o acumulado; a meta e atingida ao alcancar o alvo</p>
        </div>
        <div className="card-body">
          {goalsQ.isLoading && <p className="text-sm text-neutral-500">Carregando...</p>}
          {!goalsQ.isLoading && items.length === 0 && (
            <div className="flex items-center gap-3 text-sm text-neutral-600">
              <Target className="h-5 w-5 text-neutral-400" />
              Nenhuma meta cadastrada. Crie a primeira em Nova meta.
            </div>
          )}

          <ul className="divide-y divide-neutral-100">
            {items.map((goal) => (
              <GoalRow
                key={goal.id}
                goal={goal}
                onContribute={(amount) => contribute(goal, amount)}
                onUpdateTarget={(target) => updateTarget(goal, target)}
                onRemove={() => removeGoal(goal)}
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
  testid,
}: {
  label: string;
  value: number;
  tone: string;
  testid: string;
}) {
  return (
    <div className="card" data-testid={testid}>
      <div className="card-body">
        <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
        <div className={cls('mt-1 text-2xl font-semibold', tone)}>{formatCurrency(value)}</div>
      </div>
    </div>
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

  async function submitContribution(e: FormEvent) {
    e.preventDefault();
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

  async function submitTarget(e: FormEvent) {
    e.preventDefault();
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
    <li data-testid={`meta-${goal.id}`} className="py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-neutral-900">{goal.name}</span>
            <span
              data-testid={`meta-status-${goal.id}`}
              className={`badge ${statusBadge(goal.status)}`}
            >
              {statusLabel(goal.status)}
            </span>
          </div>
          <div className="text-xs text-neutral-500">
            {formatCurrency(goal.currentAmount)} de {formatCurrency(goal.targetAmount)} ·{' '}
            {formatPercent(goal.progressPercent)}
            {goal.deadline && <> · prazo {formatDate(goal.deadline)}</>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div
            data-testid={`meta-saldo-${goal.id}`}
            className={cls(
              'text-sm font-semibold',
              Number(goal.remainingAmount) <= 0 ? 'text-success-700' : 'text-neutral-900',
            )}
          >
            {formatCurrency(goal.remainingAmount)}
          </div>
          <button
            type="button"
            className="btn-outline"
            onClick={() => {
              setMode(mode === 'contribute' ? 'idle' : 'contribute');
              setError(null);
            }}
          >
            Contribuir
          </button>
          <button
            type="button"
            className="btn-outline"
            data-testid={`meta-editar-${goal.id}`}
            onClick={() => {
              setTarget(goal.targetAmount);
              setMode(mode === 'target' ? 'idle' : 'target');
              setError(null);
            }}
          >
            {mode === 'target' ? 'Cancelar' : 'Editar alvo'}
          </button>
          <button
            type="button"
            className="btn-outline"
            data-testid={`meta-remover-${goal.id}`}
            onClick={onRemove}
          >
            <Trash2 className="h-4 w-4" /> Remover
          </button>
        </div>
      </div>

      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-neutral-100">
        <div
          data-testid={`meta-progresso-${goal.id}`}
          className={cls('h-full rounded-full transition duration-normal', statusBar(goal.status))}
          style={{ width: `${Math.min(goal.progressPercent, 100)}%` }}
        />
      </div>

      {mode === 'contribute' && (
        <form className="mt-3 flex flex-wrap items-end gap-3" onSubmit={submitContribution}>
          <div>
            <label htmlFor={`goalContribution-${goal.id}`} className="label block">
              Valor da contribuicao
            </label>
            <input
              id={`goalContribution-${goal.id}`}
              data-testid={`meta-contribuicao-input-${goal.id}`}
              className="input mt-1"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn-primary" disabled={busy}>
            <Check className="h-4 w-4" /> {busy ? 'Registrando...' : 'Registrar'}
          </button>
          {error && <span className="text-sm text-danger-700">{error}</span>}
        </form>
      )}

      {mode === 'target' && (
        <form className="mt-3 flex flex-wrap items-end gap-3" onSubmit={submitTarget}>
          <div>
            <label htmlFor={`goalTarget-${goal.id}`} className="label block">
              Novo alvo
            </label>
            <input
              id={`goalTarget-${goal.id}`}
              data-testid={`meta-alvo-input-${goal.id}`}
              className="input mt-1"
              inputMode="decimal"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn-primary" disabled={busy}>
            <Check className="h-4 w-4" /> {busy ? 'Salvando...' : 'Salvar'}
          </button>
          {error && <span className="text-sm text-danger-700">{error}</span>}
        </form>
      )}
    </li>
  );
}

function GoalForm({
  spaceId,
  onCreated,
}: {
  spaceId: string | null;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [deadline, setDeadline] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!spaceId) return;
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
    <section className="card">
      <div className="card-header">
        <h2 className="card-title text-lg">Nova meta</h2>
        <p className="card-subtitle">Informe o valor-alvo e, se quiser, um prazo. O acumulado cresce com as contribuicoes.</p>
      </div>
      <form className="card-body space-y-4" onSubmit={submit}>
        {error && (
          <div className="rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700">
            {error}
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-3">
          <div className="md:col-span-1">
            <label htmlFor="goalName" className="label block">
              Nome
            </label>
            <input
              id="goalName"
              data-testid="meta-nome"
              className="input mt-1"
              placeholder="Ex.: Reserva de emergencia"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="goalTarget" className="label block">
              Valor-alvo
            </label>
            <input
              id="goalTarget"
              data-testid="meta-alvo"
              className="input mt-1"
              inputMode="decimal"
              placeholder="Ex.: 10000.00"
              value={targetAmount}
              onChange={(e) => setTargetAmount(e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="goalDeadline" className="label block">
              Prazo (opcional)
            </label>
            <input
              id="goalDeadline"
              data-testid="meta-prazo"
              className="input mt-1"
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </div>
        </div>
        <button type="submit" className="btn-primary" data-testid="meta-salvar" disabled={busy}>
          {busy ? 'Criando...' : 'Criar meta'}
        </button>
      </form>
    </section>
  );
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
      return 'border-success-200 bg-success-50 text-success-700';
    case 'overdue':
      return 'border-danger-200 bg-danger-50 text-danger-700';
    default:
      return 'border-brand-200 bg-brand-50 text-brand-700';
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

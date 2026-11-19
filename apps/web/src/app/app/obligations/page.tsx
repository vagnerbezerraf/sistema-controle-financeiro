'use client';
import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/components/auth/AuthContext';
import { apiFetch } from '@/lib/api-client';
import { formatCurrency, formatDate, cls } from '@/lib/format';
import type {
  Obligation,
  ObligationStatus,
  RecurrenceRule,
  RecurrenceFrequency,
  CreateObligationRequest,
  CreateRecurrenceRequest,
} from '@scf/api-contracts';
import { CalendarClock, Check, Plus, RefreshCw, X } from 'lucide-react';

/** Situacoes em aberto: ainda podem ser vencidas, conciliadas ou canceladas. */
const OPEN_STATUSES: ObligationStatus[] = ['forecast', 'pending', 'partially_reconciled'];

interface TransactionLite {
  id: string;
  description: string;
  totalAmount: string;
  effectiveDate: string;
}

export default function ObligationsPage() {
  const { currentSpaceId } = useAuth();
  const qc = useQueryClient();

  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);

  const params = useMemo(() => {
    const sp = new URLSearchParams();
    if (type) sp.set('type', type);
    // O filtro `overdue` tem precedencia sobre `status` na API.
    if (overdueOnly) sp.set('overdue', 'true');
    else if (status) sp.set('status', status);
    return sp.toString();
  }, [type, status, overdueOnly]);

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
    await apiFetch(`/financial-spaces/${currentSpaceId}/obligations/${obligation.id}`, {
      method: 'PATCH',
      json: { status: next, version: obligation.version },
    });
    await refresh();
  }

  async function generate(rule: RecurrenceRule) {
    if (!currentSpaceId) return;
    const res = await apiFetch<{ generatedCount: number; plannedCount: number }>(
      `/financial-spaces/${currentSpaceId}/recurrences/${rule.id}/generate`,
      { method: 'POST', json: {} },
    );
    setFlash(
      res.generatedCount > 0
        ? `${res.generatedCount} nova(s) previsao(oes) gerada(s).`
        : 'Nenhuma previsao nova: a agenda ja estava materializada.',
    );
    await refresh();
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Contas a pagar e receber</h1>
          <p className="text-sm text-neutral-500">
            Previsoes e recorrencias que nao distorcem o saldo realizado.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={showRecurrence ? 'btn-outline' : 'btn-outline'}
            data-testid="nova-recorrencia"
            onClick={() => {
              setShowRecurrence((v) => !v);
              setShowCreate(false);
            }}
          >
            {showRecurrence ? <X className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
            {showRecurrence ? 'Cancelar' : 'Nova recorrencia'}
          </button>
          <button
            type="button"
            className={showCreate ? 'btn-outline' : 'btn-primary'}
            data-testid="nova-conta"
            onClick={() => {
              setShowCreate((v) => !v);
              setShowRecurrence(false);
            }}
          >
            {showCreate ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showCreate ? 'Cancelar' : 'Nova conta'}
          </button>
        </div>
      </header>

      {flash && (
        <div className="rounded-md border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-700">
          {flash}
        </div>
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

      {showCreate && (
        <ObligationForm
          spaceId={currentSpaceId}
          onCreated={async () => {
            setShowCreate(false);
            await refresh();
          }}
        />
      )}

      <section className="grid gap-4 md:grid-cols-3">
        <SummaryCard label="A pagar (em aberto)" value={summary.payable} tone="text-danger-700" />
        <SummaryCard label="A receber (em aberto)" value={summary.receivable} tone="text-success-700" />
        <div className="card">
          <div className="card-body">
            <div className="text-xs uppercase tracking-wide text-neutral-500">Vencidas</div>
            <div className="mt-1 text-2xl font-semibold text-warning-700">{summary.overdue}</div>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-header flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="card-title">Vencimentos</h2>
            <p className="card-subtitle">Mais proximos primeiro</p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="filterType" className="label block">
                Tipo
              </label>
              <select
                id="filterType"
                data-testid="filtro-tipo"
                className="input mt-1"
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                <option value="">Todos</option>
                <option value="expense">A pagar</option>
                <option value="income">A receber</option>
              </select>
            </div>
            <div>
              <label htmlFor="filterStatus" className="label block">
                Situacao
              </label>
              <select
                id="filterStatus"
                data-testid="filtro-situacao"
                className="input mt-1"
                value={overdueOnly ? 'overdue' : status}
                disabled={overdueOnly}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="">Todas</option>
                <option value="forecast">Previstas</option>
                <option value="pending">A pagar/receber</option>
                <option value="partially_reconciled">Parcialmente conciliadas</option>
                <option value="reconciled">Conciliadas</option>
                <option value="ignored">Ignoradas</option>
                <option value="canceled">Canceladas</option>
              </select>
            </div>
            <label className="mb-2 flex items-center gap-2 text-sm text-neutral-700">
              <input
                type="checkbox"
                data-testid="filtro-vencidas"
                checked={overdueOnly}
                onChange={(e) => setOverdueOnly(e.target.checked)}
              />
              Somente vencidas
            </label>
          </div>
        </div>
        <div className="card-body">
          {obligationsQ.isLoading && <p className="text-sm text-neutral-500">Carregando...</p>}
          {!obligationsQ.isLoading && obligations.length === 0 && (
            <div className="flex items-center gap-3 text-sm text-neutral-600">
              <CalendarClock className="h-5 w-5 text-neutral-400" />
              Nenhuma conta nesse filtro. Crie uma conta avulsa ou uma recorrencia.
            </div>
          )}

          <ul className="divide-y divide-neutral-100">
            {obligations.map((o) => (
              <li key={o.id} data-testid={`conta-${o.id}`} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-neutral-900">{o.description}</span>
                      {o.recurrenceRuleId && (
                        <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-600">
                          recorrente
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-neutral-500">
                      vence {formatDate(o.dueDate)} ·{' '}
                      {o.type === 'income' ? 'a receber' : 'a pagar'}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className={cls('font-semibold', o.type === 'income' ? 'text-success-700' : 'text-neutral-900')}>
                      {formatCurrency(o.amount)}
                    </div>
                    <span className={`badge ${statusBadge(o)}`}>{statusLabel(o)}</span>
                    {OPEN_STATUSES.includes(o.status) && (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="btn-outline"
                          data-testid={`conciliar-${o.id}`}
                          onClick={() => setReconcileId(o.id)}
                        >
                          <Check className="h-4 w-4" /> Conciliar
                        </button>
                        <button
                          type="button"
                          className="btn-outline"
                          data-testid={`cancelar-${o.id}`}
                          onClick={() => changeStatus(o, 'canceled')}
                        >
                          Cancelar
                        </button>
                      </div>
                    )}
                  </div>
                </div>

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
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <h2 className="card-title">Recorrencias</h2>
          <p className="card-subtitle">Agendas que geram contas previstas</p>
        </div>
        <div className="card-body">
          {rules.length === 0 && (
            <p className="text-sm text-neutral-500">
              Nenhuma recorrencia. Use o botao Nova recorrencia para agendar contas fixas.
            </p>
          )}
          <ul className="divide-y divide-neutral-100">
            {rules.map((r) => (
              <li key={r.id} data-testid={`regra-${r.id}`} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-medium text-neutral-900">{r.template.description}</div>
                    <div className="text-xs text-neutral-500">
                      {frequencyLabel(r.frequency, r.interval)} · inicio {formatDate(r.startDate)}
                      {r.endDate ? ` · fim ${formatDate(r.endDate)}` : ''}
                      {r.occurrencesLimit ? ` · limite ${r.occurrencesLimit}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold">{formatCurrency(r.template.amount)}</span>
                    <span
                      className={`badge ${
                        r.state === 'active'
                          ? 'border-success-200 bg-success-50 text-success-700'
                          : 'border-neutral-200 bg-neutral-50 text-neutral-600'
                      }`}
                    >
                      {r.state === 'active' ? 'Ativa' : 'Arquivada'}
                    </span>
                    <button
                      type="button"
                      className="btn-outline"
                      data-testid={`gerar-${r.id}`}
                      disabled={r.state !== 'active'}
                      onClick={() => generate(r)}
                    >
                      <RefreshCw className="h-4 w-4" /> Gerar
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

function SummaryCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="card">
      <div className="card-body">
        <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
        <div className={cls('mt-1 text-2xl font-semibold', tone)}>{formatCurrency(value)}</div>
      </div>
    </div>
  );
}

function ObligationForm({ spaceId, onCreated }: { spaceId: string | null; onCreated: () => void }) {
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!spaceId) return;
    setError(null);
    setBusy(true);
    try {
      const body: CreateObligationRequest = {
        type,
        description: description.trim(),
        amount: amount.trim(),
        dueDate,
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
    <section className="card">
      <div className="card-header">
        <h2 className="card-title text-lg">Nova conta</h2>
        <p className="card-subtitle">Conta avulsa, sem recorrencia.</p>
      </div>
      <form className="card-body space-y-4" onSubmit={submit}>
        {error && (
          <div className="rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700">
            {error}
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label htmlFor="obType" className="label block">
              Tipo
            </label>
            <select
              id="obType"
              data-testid="conta-tipo"
              className="input mt-1"
              value={type}
              onChange={(e) => setType(e.target.value as 'expense' | 'income')}
            >
              <option value="expense">A pagar</option>
              <option value="income">A receber</option>
            </select>
          </div>
          <div>
            <label htmlFor="obDescription" className="label block">
              Descricao
            </label>
            <input
              id="obDescription"
              data-testid="conta-descricao"
              className="input mt-1"
              placeholder="Ex.: IPTU 2026"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="obAmount" className="label block">
              Valor
            </label>
            <input
              id="obAmount"
              data-testid="conta-valor"
              className="input mt-1"
              inputMode="decimal"
              placeholder="Ex.: 450.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="obDueDate" className="label block">
              Vencimento
            </label>
            <input
              id="obDueDate"
              data-testid="conta-vencimento"
              className="input mt-1"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              required
            />
          </div>
        </div>
        <button type="submit" className="btn-primary" data-testid="conta-salvar" disabled={busy}>
          {busy ? 'Criando...' : 'Criar conta'}
        </button>
      </form>
    </section>
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
  const [interval, setInterval] = useState('1');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [occurrencesLimit, setOccurrencesLimit] = useState('');
  const [generateUpTo, setGenerateUpTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!spaceId) return;
    setError(null);
    setBusy(true);
    try {
      const body: CreateRecurrenceRequest = {
        frequency,
        interval: Number(interval) || 1,
        startDate,
        template: { type, description: description.trim(), amount: amount.trim() },
        ...(endDate ? { endDate } : {}),
        ...(occurrencesLimit ? { occurrencesLimit: Number(occurrencesLimit) } : {}),
        ...(generateUpTo ? { generateUpTo } : {}),
      };
      const res = await apiFetch<{ generatedCount: number }>(
        `/financial-spaces/${spaceId}/recurrences`,
        { method: 'POST', json: body },
      );
      setDescription('');
      setAmount('');
      setStartDate('');
      setEndDate('');
      setOccurrencesLimit('');
      setGenerateUpTo('');
      onCreated(res.generatedCount);
    } catch (e: any) {
      setError(e?.details?.message ?? e?.message ?? 'Nao foi possivel criar a recorrencia');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <div className="card-header">
        <h2 className="card-title text-lg">Nova recorrencia</h2>
        <p className="card-subtitle">
          Gera as contas previstas ate o horizonte informado (padrao: hoje + 12 meses).
        </p>
      </div>
      <form className="card-body space-y-4" onSubmit={submit}>
        {error && (
          <div className="rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700">
            {error}
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label htmlFor="recType" className="label block">
              Tipo
            </label>
            <select
              id="recType"
              data-testid="recorrencia-tipo"
              className="input mt-1"
              value={type}
              onChange={(e) => setType(e.target.value as 'expense' | 'income')}
            >
              <option value="expense">A pagar</option>
              <option value="income">A receber</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label htmlFor="recDescription" className="label block">
              Descricao
            </label>
            <input
              id="recDescription"
              data-testid="recorrencia-descricao"
              className="input mt-1"
              placeholder="Ex.: Aluguel"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="recAmount" className="label block">
              Valor
            </label>
            <input
              id="recAmount"
              data-testid="recorrencia-valor"
              className="input mt-1"
              inputMode="decimal"
              placeholder="Ex.: 1800.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="recFrequency" className="label block">
              Frequencia
            </label>
            <select
              id="recFrequency"
              data-testid="recorrencia-frequencia"
              className="input mt-1"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as RecurrenceFrequency)}
            >
              <option value="daily">Diaria</option>
              <option value="weekly">Semanal</option>
              <option value="monthly">Mensal</option>
              <option value="yearly">Anual</option>
            </select>
          </div>
          <div>
            <label htmlFor="recInterval" className="label block">
              A cada
            </label>
            <input
              id="recInterval"
              data-testid="recorrencia-intervalo"
              className="input mt-1"
              type="number"
              min={1}
              value={interval}
              onChange={(e) => setInterval(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="recStart" className="label block">
              Inicio
            </label>
            <input
              id="recStart"
              data-testid="recorrencia-inicio"
              className="input mt-1"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="recEnd" className="label block">
              Fim (opcional)
            </label>
            <input
              id="recEnd"
              data-testid="recorrencia-fim"
              className="input mt-1"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="recLimit" className="label block">
              Limite (opcional)
            </label>
            <input
              id="recLimit"
              data-testid="recorrencia-limite"
              className="input mt-1"
              type="number"
              min={1}
              placeholder="Ex.: 12"
              value={occurrencesLimit}
              onChange={(e) => setOccurrencesLimit(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="recHorizon" className="label block">
              Gerar previsoes ate (opcional)
            </label>
            <input
              id="recHorizon"
              data-testid="recorrencia-horizonte"
              className="input mt-1"
              type="date"
              value={generateUpTo}
              onChange={(e) => setGenerateUpTo(e.target.value)}
            />
          </div>
        </div>
        <button type="submit" className="btn-primary" data-testid="recorrencia-salvar" disabled={busy}>
          {busy ? 'Criando...' : 'Criar recorrencia'}
        </button>
      </form>
    </section>
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
      apiFetch<{ items: TransactionLite[] }>(
        `/financial-spaces/${spaceId}/transactions?type=${obligation.type}&status=confirmed&limit=50`,
      ),
  });
  const options = transactionsQ.data?.items ?? [];

  useEffect(() => {
    if (!transactionId && options.length) setTransactionId(options[0].id);
  }, [options, transactionId]);

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
    <div className="mt-3 rounded-md border border-neutral-200 bg-neutral-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-neutral-900">Conciliar com um lancamento confirmado</p>
        <button type="button" className="btn-outline" onClick={onClose} disabled={busy}>
          <X className="h-4 w-4" /> Fechar
        </button>
      </div>
      {error && (
        <div className="mt-3 rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700">
          {error}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div className="min-w-[16rem] flex-1">
          <label htmlFor="reconcileTrx" className="label block">
            Lancamento
          </label>
          <select
            id="reconcileTrx"
            data-testid="conciliar-lancamento"
            className="input mt-1"
            value={transactionId}
            onChange={(e) => setTransactionId(e.target.value)}
          >
            {options.length === 0 && <option value="">Nenhum lancamento confirmado</option>}
            {options.map((t) => (
              <option key={t.id} value={t.id}>
                {formatDate(t.effectiveDate)} · {t.description} · {formatCurrency(t.totalAmount)}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className="btn-primary"
          data-testid="conciliar-confirmar"
          onClick={submit}
          disabled={busy || !transactionId}
        >
          {busy ? 'Conciliando...' : 'Confirmar conciliacao'}
        </button>
      </div>
    </div>
  );
}

function statusLabel(o: Obligation): string {
  if (o.overdue) return 'Vencida';
  switch (o.status) {
    case 'forecast':
      return 'Prevista';
    case 'pending':
      return 'Em aberto';
    case 'partially_reconciled':
      return 'Parcial';
    case 'reconciled':
      return 'Conciliada';
    case 'ignored':
      return 'Ignorada';
    case 'canceled':
      return 'Cancelada';
    default:
      return o.status;
  }
}

function statusBadge(o: Obligation): string {
  if (o.overdue) return 'border-warning-200 bg-warning-50 text-warning-700';
  switch (o.status) {
    case 'reconciled':
      return 'border-success-200 bg-success-50 text-success-700';
    case 'partially_reconciled':
      return 'border-brand-200 bg-brand-50 text-brand-700';
    case 'canceled':
    case 'ignored':
      return 'border-neutral-200 bg-neutral-50 text-neutral-600';
    default:
      return 'border-neutral-200 bg-neutral-50 text-neutral-700';
  }
}

function frequencyLabel(frequency: RecurrenceFrequency, interval: number): string {
  const names: Record<RecurrenceFrequency, string> = {
    daily: 'diaria',
    weekly: 'semanal',
    monthly: 'mensal',
    yearly: 'anual',
  };
  return interval > 1 ? `a cada ${interval} (${names[frequency]})` : names[frequency];
}

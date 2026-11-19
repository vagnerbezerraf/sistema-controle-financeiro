'use client';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/components/auth/AuthContext';
import { apiFetch } from '@/lib/api-client';
import { formatCurrency, formatDate, cls } from '@/lib/format';
import type {
  ApplyReconciliationResult,
  ImportBatch,
  ReconciliationBand,
  ReconciliationReason,
  ReconciliationView,
} from '@scf/api-contracts';
import { AlertTriangle, CheckCircle2, GitMerge, Sparkles } from 'lucide-react';

export default function ReconciliationPage() {
  const { currentSpaceId } = useAuth();
  const qc = useQueryClient();

  const [batchId, setBatchId] = useState('');
  const [obligationId, setObligationId] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const batchesQ = useQuery({
    queryKey: ['imports', currentSpaceId],
    enabled: !!currentSpaceId,
    queryFn: () => apiFetch<ImportBatch[]>(`/financial-spaces/${currentSpaceId}/imports`),
  });

  const viewQ = useQuery({
    queryKey: ['reconciliation', currentSpaceId, batchId],
    enabled: !!currentSpaceId,
    queryFn: () =>
      apiFetch<ReconciliationView>(
        `/financial-spaces/${currentSpaceId}/reconciliation${batchId ? `?batchId=${batchId}` : ''}`,
      ),
  });

  const batches = (batchesQ.data ?? []).filter((b) => b.status === 'committed');
  const view = viewQ.data;

  useEffect(() => {
    setObligationId('');
    setTransactionId('');
  }, [batchId]);

  useEffect(() => {
    if (!view) return;
    if (!view.obligations.some((o) => o.id === obligationId)) {
      setObligationId(view.obligations[0]?.id ?? '');
    }
    if (!view.transactions.some((t) => t.id === transactionId)) {
      setTransactionId(view.transactions[0]?.id ?? '');
    }
  }, [view, obligationId, transactionId]);

  async function refresh() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['reconciliation', currentSpaceId] }),
      qc.invalidateQueries({ queryKey: ['obligations', currentSpaceId] }),
    ]);
  }

  async function runAuto() {
    if (!currentSpaceId) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const result = await apiFetch<ApplyReconciliationResult>(
        `/financial-spaces/${currentSpaceId}/reconciliation/auto`,
        { method: 'POST', json: batchId ? { batchId } : {} },
      );
      setNotice(
        result.appliedCount === 0
          ? 'Nenhum casamento de alta confianca encontrado.'
          : `${result.appliedCount} conta(s) conciliada(s) automaticamente.`,
      );
      await refresh();
    } catch (e: any) {
      setError(e?.details?.message ?? e?.message ?? 'Nao foi possivel conciliar automaticamente');
    } finally {
      setBusy(false);
    }
  }

  async function applyMatches(matches: Array<{ obligationId: string; transactionId: string }>) {
    if (!currentSpaceId || matches.length === 0) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const result = await apiFetch<ApplyReconciliationResult>(
        `/financial-spaces/${currentSpaceId}/reconciliation/apply`,
        { method: 'POST', json: { matches } },
      );
      setNotice(`${result.appliedCount} conta(s) conciliada(s).`);
      await refresh();
    } catch (e: any) {
      setError(e?.details?.message ?? e?.message ?? 'Nao foi possivel conciliar');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Conciliacao</h1>
        <p className="text-sm text-neutral-500">
          Case as contas previstas com os itens de extrato importados. A conciliacao automatica aplica
          somente os casamentos de alta confianca.
        </p>
      </header>

      {error && (
        <div
          data-testid="conciliacao-aviso"
          className="flex items-center gap-3 rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700"
        >
          <AlertTriangle className="h-4 w-4" /> {error}
        </div>
      )}
      {notice && (
        <div
          data-testid="conciliacao-sucesso"
          className="flex items-center gap-3 rounded-md border border-success-200 bg-success-50 px-3 py-2 text-sm text-success-700"
        >
          <CheckCircle2 className="h-4 w-4" /> {notice}
        </div>
      )}

      <section className="card">
        <div className="card-header flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-[16rem]">
            <label htmlFor="conciliacao-lote" className="label block">
              Lote de importacao
            </label>
            <select
              id="conciliacao-lote"
              data-testid="conciliacao-lote"
              className="input mt-1"
              value={batchId}
              onChange={(e) => setBatchId(e.target.value)}
            >
              <option value="">Todos os lotes importados</option>
              {batches.map((batch) => (
                <option key={batch.id} value={batch.id}>
                  {batch.fileName ?? `Arquivo ${batch.format.toUpperCase()}`} · {batch.importedCount}{' '}
                  importadas
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="btn-primary"
            data-testid="conciliacao-automatica"
            disabled={busy || !view || view.suggestions.length === 0}
            onClick={runAuto}
          >
            <Sparkles className="h-4 w-4" /> Conciliar automaticamente
          </button>
        </div>
        <div className="card-body grid gap-4 md:grid-cols-3">
          <CountCard testid="conciliacao-resumo-alta" label="Alta confianca" value={view?.counts.high ?? 0} band="high" />
          <CountCard testid="conciliacao-resumo-media" label="Media confianca" value={view?.counts.medium ?? 0} band="medium" />
          <CountCard testid="conciliacao-resumo-baixa" label="Baixa confianca" value={view?.counts.low ?? 0} band="low" />
        </div>
      </section>

      {viewQ.isLoading && <p className="text-sm text-neutral-500">Carregando...</p>}

      {!viewQ.isLoading && view && view.obligations.length === 0 && view.transactions.length === 0 && (
        <div
          data-testid="conciliacao-vazio"
          className="card card-body flex items-center gap-3 text-sm text-neutral-600"
        >
          <GitMerge className="h-5 w-5 text-neutral-400" />
          Nada para conciliar: nao ha contas previstas em aberto nem itens importados pendentes.
        </div>
      )}

      {view && view.suggestions.length > 0 && (
        <section className="card">
          <div className="card-header">
            <h2 className="card-title">Sugestoes de casamento</h2>
            <p className="card-subtitle">
              Casamentos automaticos entre contas previstas e itens importados (cada lado aparece uma vez).
            </p>
          </div>
          <div className="card-body overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-neutral-500">
                  <th className="py-2">Conta prevista</th>
                  <th className="py-2">Item importado</th>
                  <th className="py-2">Confianca</th>
                  <th className="py-2">Motivos</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {view.suggestions.map((s, index) => {
                  const obligation = view.obligations.find((o) => o.id === s.obligationId);
                  const transaction = view.transactions.find((t) => t.id === s.transactionId);
                  return (
                    <tr key={`${s.obligationId}-${s.transactionId}`} data-testid={`conciliacao-sugestao-${index}`}>
                      <td className="py-2 text-neutral-900">
                        <div className="font-medium">{obligation?.description ?? '-'}</div>
                        <div className="text-xs text-neutral-500">
                          {obligation ? `${formatDate(obligation.dueDate)} · ${formatCurrency(obligation.amount)}` : ''}
                        </div>
                      </td>
                      <td className="py-2 text-neutral-900">
                        <div className="font-medium">{transaction?.description ?? '-'}</div>
                        <div className="text-xs text-neutral-500">
                          {transaction
                            ? `${formatDate(transaction.effectiveDate)} · ${formatCurrency(transaction.totalAmount)}`
                            : ''}
                        </div>
                      </td>
                      <td className="py-2">
                        <span className={cls('badge', bandBadge(s.band))}>{s.score} · {bandLabel(s.band)}</span>
                      </td>
                      <td className="py-2 text-xs text-neutral-600">{s.reasons.map(reasonLabel).join(', ')}</td>
                      <td className="py-2 text-right">
                        <button
                          type="button"
                          className="btn-outline"
                          data-testid={`conciliacao-aplicar-${index}`}
                          disabled={busy}
                          onClick={() =>
                            applyMatches([{ obligationId: s.obligationId, transactionId: s.transactionId }])
                          }
                        >
                          <GitMerge className="h-4 w-4" /> Conciliar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {view && (view.obligations.length > 0 || view.transactions.length > 0) && (
        <section className="card">
          <div className="card-header">
            <h2 className="card-title">Conciliacao manual</h2>
            <p className="card-subtitle">Escolha a conta prevista e o item importado que a quita.</p>
          </div>
          <div className="card-body flex flex-wrap items-end gap-3">
            <div className="min-w-[16rem] flex-1">
              <label htmlFor="conciliacao-conta" className="label block">
                Conta prevista
              </label>
              <select
                id="conciliacao-conta"
                data-testid="conciliacao-conta"
                className="input mt-1"
                value={obligationId}
                onChange={(e) => setObligationId(e.target.value)}
              >
                {view.obligations.length === 0 && <option value="">Nenhuma conta em aberto</option>}
                {view.obligations.map((o) => (
                  <option key={o.id} value={o.id}>
                    {formatDate(o.dueDate)} · {o.description} · {formatCurrency(o.amount)}
                    {o.overdue ? ' (vencida)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-[16rem] flex-1">
              <label htmlFor="conciliacao-item" className="label block">
                Item importado
              </label>
              <select
                id="conciliacao-item"
                data-testid="conciliacao-item"
                className="input mt-1"
                value={transactionId}
                onChange={(e) => setTransactionId(e.target.value)}
              >
                {view.transactions.length === 0 && <option value="">Nenhum item importado</option>}
                {view.transactions.map((t) => (
                  <option key={t.id} value={t.id}>
                    {formatDate(t.effectiveDate)} · {t.description} · {formatCurrency(t.totalAmount)}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="btn-primary"
              data-testid="conciliacao-conciliar"
              disabled={busy || !obligationId || !transactionId}
              onClick={() => applyMatches([{ obligationId, transactionId }])}
            >
              <GitMerge className="h-4 w-4" /> Conciliar
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function CountCard({
  label,
  value,
  band,
  testid,
}: {
  label: string;
  value: number;
  band: ReconciliationBand;
  testid: string;
}) {
  return (
    <div className="rounded-md border border-neutral-200 p-3" data-testid={testid}>
      <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
      <div className={cls('mt-1 text-2xl font-semibold', bandText(band))}>{value}</div>
    </div>
  );
}

function bandLabel(band: ReconciliationBand): string {
  return band === 'high' ? 'Alta' : band === 'medium' ? 'Media' : 'Baixa';
}

function bandBadge(band: ReconciliationBand): string {
  switch (band) {
    case 'high':
      return 'border-success-200 bg-success-50 text-success-700';
    case 'medium':
      return 'border-brand-200 bg-brand-50 text-brand-700';
    default:
      return 'border-neutral-200 bg-neutral-50 text-neutral-600';
  }
}

function bandText(band: ReconciliationBand): string {
  return band === 'high'
    ? 'text-success-700'
    : band === 'medium'
      ? 'text-brand-700'
      : 'text-neutral-700';
}

const REASON_LABELS: Record<ReconciliationReason, string> = {
  valor_igual: 'valor igual',
  valor_cobre: 'valor cobre',
  valor_proximo: 'valor proximo',
  mesma_data: 'mesma data',
  data_proxima: 'data proxima',
  descricao_similar: 'descricao similar',
};

function reasonLabel(reason: ReconciliationReason): string {
  return REASON_LABELS[reason] ?? reason;
}

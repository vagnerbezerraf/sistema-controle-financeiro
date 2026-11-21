'use client';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/components/auth/AuthContext';
import { apiFetch, API_BASE_URL, getAuthToken } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format';
import type { CreateReportJobRequest, ReportJob, ReportJobStatus } from '@scf/api-contracts';
import { Check, Download, FileBarChart, Plus, X } from 'lucide-react';

/** Rotulo de cada situacao do job (sem acentos, como o resto da interface). */
const STATUS_LABEL: Record<ReportJobStatus, string> = {
  pending: 'Pendente',
  running: 'Processando',
  done: 'Concluido',
  error: 'Erro',
};

export default function ReportJobsPage() {
  const { currentSpaceId } = useAuth();
  const qc = useQueryClient();

  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const jobsQ = useQuery({
    queryKey: ['report-jobs', currentSpaceId],
    enabled: !!currentSpaceId,
    queryFn: () => apiFetch<ReportJob[]>(`/financial-spaces/${currentSpaceId}/reports`),
    // Enquanto houver um job em andamento, acompanha o avanco do processamento.
    refetchInterval: (query) => {
      const jobs = query.state.data;
      return jobs?.some((j) => j.status === 'pending' || j.status === 'running') ? 3000 : false;
    },
  });

  const jobs = jobsQ.data ?? [];

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ['report-jobs', currentSpaceId] });
  }

  async function download(job: ReportJob) {
    if (!currentSpaceId) return;
    setError(null);
    const token = getAuthToken();
    try {
      const res = await fetch(
        `${API_BASE_URL}/financial-spaces/${currentSpaceId}/reports/${job.id}/download`,
        { headers: token ? { authorization: `Bearer ${token}` } : {} },
      );
      if (!res.ok) {
        setError('Nao foi possivel baixar o relatorio');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `relatorio-${job.id}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('Nao foi possivel baixar o relatorio');
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Relatorios assincronos</h1>
          <p className="text-sm text-neutral-500">
            Solicite a exportacao de lancamentos e baixe o arquivo quando o processamento terminar.
          </p>
        </div>
        <button
          type="button"
          className={showCreate ? 'btn-outline' : 'btn-primary'}
          data-testid="relatorio-novo"
          onClick={() => setShowCreate((v) => !v)}
        >
          {showCreate ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showCreate ? 'Cancelar' : 'Novo relatorio'}
        </button>
      </header>

      {error && (
        <div className="rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700">
          {error}
        </div>
      )}

      {showCreate && (
        <ReportJobForm
          spaceId={currentSpaceId}
          onCreated={async () => {
            setShowCreate(false);
            await refresh();
          }}
        />
      )}

      <section className="card">
        <div className="card-header">
          <h2 className="card-title">Relatorios solicitados</h2>
          <p className="card-subtitle">Os pedidos mais recentes aparecem primeiro</p>
        </div>
        <div className="card-body">
          {jobsQ.isLoading && <p className="text-sm text-neutral-500">Carregando...</p>}
          {!jobsQ.isLoading && jobs.length === 0 && (
            <div className="flex items-center gap-3 text-sm text-neutral-600" data-testid="relatorio-vazio">
              <FileBarChart className="h-5 w-5 text-neutral-400" />
              Nenhum relatorio solicitado.
            </div>
          )}

          <ul className="divide-y divide-neutral-100">
            {jobs.map((job) => (
              <ReportJobRow key={job.id} job={job} onDownload={download} />
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

function ReportJobRow({ job, onDownload }: { job: ReportJob; onDownload: (job: ReportJob) => void }) {
  const period =
    job.params.from && job.params.to ? `${job.params.from} a ${job.params.to}` : 'Periodo padrao';

  return (
    <li data-testid={`relatorio-item-${job.id}`} className="py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-medium text-neutral-900">
            Exportacao de lancamentos
          </div>
          <div className="text-xs text-neutral-500">
            {period} · criado em {formatDateTime(job.createdAt)}
            {job.status === 'done' && job.rowCount != null ? ` · ${job.rowCount} linhas` : ''}
          </div>
          <div className="mt-1 text-xs text-neutral-600" data-testid={`relatorio-status-${job.id}`}>
            {STATUS_LABEL[job.status]}
            {job.status === 'error' && job.error ? ` · ${job.error}` : ''}
          </div>
        </div>
        {job.status === 'done' && (
          <button
            type="button"
            className="btn-outline"
            data-testid={`relatorio-baixar-${job.id}`}
            onClick={() => onDownload(job)}
          >
            <Download className="h-4 w-4" /> Baixar
          </button>
        )}
      </div>
    </li>
  );
}

function ReportJobForm({ spaceId, onCreated }: { spaceId: string | null; onCreated: () => void }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!spaceId) return;
    setError(null);
    setBusy(true);
    try {
      const body: CreateReportJobRequest = {
        type: 'transactions_export',
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
      };
      await apiFetch(`/financial-spaces/${spaceId}/reports`, { method: 'POST', json: body });
      onCreated();
    } catch (e: any) {
      setError(e?.details?.message ?? e?.message ?? 'Nao foi possivel solicitar o relatorio');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <div className="card-header">
        <h2 className="card-title text-lg">Novo relatorio</h2>
        <p className="card-subtitle">
          Exportacao de lancamentos em CSV. Sem periodo informado, o padrao sao os ultimos 30 dias.
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
            <label htmlFor="reportFrom" className="label block">
              De (opcional)
            </label>
            <input
              id="reportFrom"
              data-testid="relatorio-de"
              type="date"
              className="input mt-1"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="reportTo" className="label block">
              Ate (opcional)
            </label>
            <input
              id="reportTo"
              data-testid="relatorio-ate"
              type="date"
              className="input mt-1"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </div>
        <button type="submit" className="btn-primary" data-testid="relatorio-criar" disabled={busy}>
          {busy ? 'Solicitando...' : (<><Check className="h-4 w-4" /> Solicitar relatorio</>)}
        </button>
      </form>
    </section>
  );
}

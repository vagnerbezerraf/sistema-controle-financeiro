import { useState } from 'react';
import type { FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthContext';
import { API_BASE_URL, apiFetch } from '../lib/api';
import { formatDate } from '../lib/format';
import type { CreateReportJobRequest, ReportJob, ReportJobStatus } from '@scf/api-contracts';
import { Check, Download, FileText } from 'lucide-react';

const STATUS_LABELS: Record<ReportJobStatus, string> = {
  pending: 'Pendente',
  running: 'Processando',
  done: 'Concluido',
  error: 'Erro',
};

const STATUS_CLASSES: Record<ReportJobStatus, string> = {
  pending: 'border-neutral-200 bg-neutral-50 text-neutral-600',
  running: 'border-brand-200 bg-brand-50 text-brand-700',
  done: 'border-success-200 bg-success-50 text-success-700',
  error: 'border-danger-200 bg-danger-50 text-danger-700',
};

/** Rotulo do periodo do job; sem filtros cobre o intervalo padrao do servidor. */
function periodLabel(job: ReportJob): string {
  const { from, to } = job.params;
  if (!from && !to) return 'Ultimos 30 dias';
  return `${from ? formatDate(from) : 'inicio'} a ${to ? formatDate(to) : 'hoje'}`;
}

export default function ReportJobsPage() {
  const { currentSpaceId } = useAuth();
  const qc = useQueryClient();

  const [error, setError] = useState<string | null>(null);

  const jobsQ = useQuery({
    queryKey: ['report-jobs', currentSpaceId],
    enabled: !!currentSpaceId,
    queryFn: () => apiFetch<ReportJob[]>(`/financial-spaces/${currentSpaceId}/reports`),
  });

  const jobs = jobsQ.data ?? [];

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ['report-jobs', currentSpaceId] });
  }

  async function downloadJob(job: ReportJob) {
    if (!currentSpaceId) return;
    setError(null);
    try {
      const url = `${API_BASE_URL}/financial-spaces/${currentSpaceId}/reports/${job.id}/download`;
      const token = localStorage.getItem('scf.access_token');
      const res = await fetch(url, { headers: token ? { authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error('O relatorio ainda nao esta pronto');
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = `relatorio-${job.id}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
    } catch (e: any) {
      setError(e?.details?.message ?? e?.message ?? 'Nao foi possivel baixar o relatorio');
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Relatorios assincronos</h1>
          <p className="text-sm text-neutral-500">
            Solicite a exportacao de lancamentos em CSV. O relatorio e processado em background e
            fica disponivel para download quando concluido.
          </p>
        </div>
      </header>

      {error && (
        <div className="rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700">
          {error}
        </div>
      )}

      <ReportJobForm spaceId={currentSpaceId} onCreated={refresh} />

      <section className="card">
        <div className="card-header">
          <h2 className="card-title">Solicitacoes</h2>
          <p className="card-subtitle">Mais recentes primeiro</p>
        </div>
        <div className="card-body">
          {jobsQ.isLoading && <p className="text-sm text-neutral-500">Carregando...</p>}
          {!jobsQ.isLoading && jobs.length === 0 && (
            <div className="flex items-center gap-3 text-sm text-neutral-600">
              <FileText className="h-5 w-5 text-neutral-400" />
              Nenhum relatorio solicitado.
            </div>
          )}

          <ul className="divide-y divide-neutral-100">
            {jobs.map((job) => (
              <ReportJobRow key={job.id} job={job} onDownload={downloadJob} />
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

function ReportJobRow({ job, onDownload }: { job: ReportJob; onDownload: (job: ReportJob) => void }) {
  return (
    <li id={`relatorio-item-${job.id}`} className="py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-neutral-900">Exportacao de lancamentos (CSV)</span>
            <span className={`badge ${STATUS_CLASSES[job.status]}`}>{STATUS_LABELS[job.status]}</span>
          </div>
          <div className="text-xs text-neutral-500">
            Periodo: {periodLabel(job)} · criado em {formatDate(job.createdAt)}
            {job.status === 'done' && job.rowCount !== null ? ` · ${job.rowCount} linhas` : ''}
          </div>
          {job.status === 'error' && job.error && (
            <div className="mt-1 text-xs text-danger-700">{job.error}</div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {job.status === 'done' && (
            <button
              type="button"
              className="btn-outline"
              id={`relatorio-baixar-${job.id}`}
              onClick={() => onDownload(job)}
            >
              <Download className="h-4 w-4" /> Baixar
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

function ReportJobForm({ spaceId, onCreated }: { spaceId: string | null; onCreated: () => Promise<void> }) {
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
      setFrom('');
      setTo('');
      await onCreated();
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
        <p className="card-subtitle">Periodo opcional; por padrao, os ultimos 30 dias.</p>
      </div>
      <form className="card-body space-y-4" onSubmit={submit}>
        {error && (
          <div className="rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700">
            {error}
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label htmlFor="relatorio-from" className="label block">
              De
            </label>
            <input
              id="relatorio-from"
              type="date"
              className="input mt-1"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="relatorio-to" className="label block">
              Ate
            </label>
            <input
              id="relatorio-to"
              type="date"
              className="input mt-1"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </div>
        <button type="submit" className="btn-primary" id="relatorio-criar" disabled={busy}>
          {busy ? 'Solicitando...' : (<><Check className="h-4 w-4" /> Solicitar relatorio</>)}
        </button>
      </form>
    </section>
  );
}

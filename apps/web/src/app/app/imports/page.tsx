'use client';
import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/components/auth/AuthContext';
import { apiFetch } from '@/lib/api-client';
import { formatCurrency, formatDate, cls } from '@/lib/format';
import type {
  Account,
  CommitImportResult,
  ImportBatch,
  ImportBatchStatus,
  ImportFormat,
  ImportPreview,
  ImportRow,
} from '@scf/api-contracts';
import { AlertTriangle, CheckCircle2, FileUp, Undo2, Upload } from 'lucide-react';

export default function ImportsPage() {
  const { currentSpaceId } = useAuth();
  const qc = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);

  const [format, setFormat] = useState<ImportFormat>('csv');
  const [accountId, setAccountId] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [source, setSource] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const accountsQ = useQuery({
    queryKey: ['accounts', currentSpaceId],
    enabled: !!currentSpaceId,
    queryFn: () => apiFetch<Account[]>(`/financial-spaces/${currentSpaceId}/accounts`),
  });

  const batchesQ = useQuery({
    queryKey: ['imports', currentSpaceId],
    enabled: !!currentSpaceId,
    queryFn: () => apiFetch<ImportBatch[]>(`/financial-spaces/${currentSpaceId}/imports`),
  });

  const accounts = accountsQ.data ?? [];
  const batches = batchesQ.data ?? [];
  const accountName = (id: string) => accounts.find((a) => a.id === id)?.name ?? 'Conta removida';

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setSource(await file.text());
    setPreview(null);
    setError(null);
    setNotice(null);
  }

  function resetForm() {
    setSource('');
    setFileName(null);
    if (fileInput.current) fileInput.current.value = '';
  }

  async function generatePreview() {
    if (!currentSpaceId || !accountId || !source.trim()) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const result = await apiFetch<ImportPreview>(
        `/financial-spaces/${currentSpaceId}/imports/${format === 'ofx' ? 'preview-ofx' : 'preview'}`,
        { method: 'POST', json: { [format]: source, accountId, ...(fileName ? { fileName } : {}) } },
      );
      setPreview(result);
    } catch (e: any) {
      setError(e?.details?.message ?? e?.message ?? 'Nao foi possivel gerar a previa');
    } finally {
      setBusy(false);
    }
  }

  async function applyImport() {
    if (!currentSpaceId || !preview) return;
    setError(null);
    setBusy(true);
    try {
      const result = await apiFetch<CommitImportResult>(
        `/financial-spaces/${currentSpaceId}/imports/${preview.batch.id}/commit`,
        { method: 'POST' },
      );
      const skipped =
        result.skippedCount > 0 ? ` (${result.skippedCount} descartados como duplicados)` : '';
      setNotice(`${result.importedCount} lancamentos importados${skipped}.`);
      setPreview(null);
      resetForm();
      await refresh();
    } catch (e: any) {
      setError(e?.details?.message ?? e?.message ?? 'Nao foi possivel importar o lote');
    } finally {
      setBusy(false);
    }
  }

  async function undoImport(batch: ImportBatch) {
    if (!currentSpaceId) return;
    setError(null);
    setBusy(true);
    try {
      await apiFetch(`/financial-spaces/${currentSpaceId}/imports/${batch.id}`, { method: 'DELETE' });
      setNotice('Importacao desfeita: os lancamentos criados foram cancelados.');
      await refresh();
    } catch (e: any) {
      setError(e?.details?.message ?? e?.message ?? 'Nao foi possivel desfazer a importacao');
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['imports', currentSpaceId] }),
      qc.invalidateQueries({ queryKey: ['transactions', currentSpaceId] }),
      qc.invalidateQueries({ queryKey: ['accounts', currentSpaceId] }),
    ]);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Importar extrato</h1>
        <p className="text-sm text-neutral-500">
          Importe um extrato CSV ou OFX com previa, deteccao de duplicados e possibilidade de desfazer.
        </p>
      </header>

      {error && (
        <div
          data-testid="importacao-aviso"
          className="flex items-center gap-3 rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700"
        >
          <AlertTriangle className="h-4 w-4" /> {error}
        </div>
      )}
      {notice && (
        <div
          data-testid="importacao-sucesso"
          className="flex items-center gap-3 rounded-md border border-success-200 bg-success-50 px-3 py-2 text-sm text-success-700"
        >
          <CheckCircle2 className="h-4 w-4" /> {notice}
        </div>
      )}

      <section className="card">
        <div className="card-header">
          <h2 className="card-title">1. Escolha o formato, a conta e o arquivo</h2>
          <p className="card-subtitle">
            {format === 'ofx'
              ? 'O arquivo OFX (Open Financial Exchange) pode ser OFX 1.x (SGML) ou OFX 2.x (XML).'
              : 'O CSV pode usar virgula ou ponto e virgula. Cabecalhos aceitos: data, descricao, valor, tipo.'}
          </p>
        </div>
        <div className="card-body space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label htmlFor="importFormat" className="label block">
                Formato
              </label>
              <select
                id="importFormat"
                data-testid="importacao-formato"
                className="input mt-1"
                value={format}
                onChange={(e) => {
                  setFormat(e.target.value as ImportFormat);
                  resetForm();
                  setPreview(null);
                }}
              >
                <option value="csv">CSV</option>
                <option value="ofx">OFX</option>
              </select>
            </div>
            <div>
              <label htmlFor="importAccount" className="label block">
                Conta de destino
              </label>
              <select
                id="importAccount"
                data-testid="importacao-conta"
                className="input mt-1"
                value={accountId}
                onChange={(e) => {
                  setAccountId(e.target.value);
                  setPreview(null);
                }}
              >
                <option value="">Selecione uma conta</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="importFile" className="label block">
                Arquivo {format.toUpperCase()}
              </label>
              <input
                id="importFile"
                ref={fileInput}
                data-testid="importacao-arquivo"
                className="input mt-1"
                type="file"
                accept={format === 'ofx' ? '.ofx,application/x-ofx' : '.csv,text/csv'}
                onChange={onFile}
              />
            </div>
          </div>

          {fileName && (
            <div data-testid="importacao-arquivo-nome" className="text-xs text-neutral-500">
              <FileUp className="mr-1 inline h-3.5 w-3.5" />
              {fileName}
            </div>
          )}

          <button
            type="button"
            className="btn-primary"
            data-testid="importacao-gerar-previa"
            disabled={busy || !accountId || !source.trim()}
            onClick={generatePreview}
          >
            <Upload className="h-4 w-4" /> {busy ? 'Processando...' : 'Gerar previa'}
          </button>
        </div>
      </section>

      {preview && (
        <section className="space-y-4" data-testid="importacao-previa">
          <div className="grid gap-4 md:grid-cols-4">
            <SummaryCard testid="importacao-resumo-total" label="Linhas" value={preview.summary.total} tone="text-neutral-900" />
            <SummaryCard testid="importacao-resumo-validas" label="Validas" value={preview.summary.valid} tone="text-success-700" />
            <SummaryCard testid="importacao-resumo-duplicadas" label="Duplicadas" value={preview.summary.duplicates} tone="text-warning-700" />
            <SummaryCard testid="importacao-resumo-invalidas" label="Invalidas" value={preview.summary.invalid} tone="text-danger-700" />
          </div>

          <div className="card">
            <div className="card-header flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="card-title">2. Revise a previa</h2>
                <p className="card-subtitle">Nada foi importado ainda. Somente as linhas validas serao aplicadas.</p>
              </div>
              <button
                type="button"
                className="btn-primary"
                data-testid="importacao-aplicar"
                disabled={busy || preview.summary.valid === 0}
                onClick={applyImport}
              >
                <CheckCircle2 className="h-4 w-4" /> Importar {preview.summary.valid} lancamentos
              </button>
            </div>
            <div className="card-body overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-neutral-500">
                    <th className="py-2">Linha</th>
                    <th className="py-2">Data</th>
                    <th className="py-2">Descricao</th>
                    <th className="py-2">Tipo</th>
                    <th className="py-2 text-right">Valor</th>
                    <th className="py-2">Situacao</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {preview.rows.map((row, index) => (
                    <tr key={`${row.line}-${index}`} data-testid={`importacao-linha-${index}`}>
                      <td className="py-2 text-neutral-500">{row.line}</td>
                      <td className="py-2 text-neutral-700">{row.date ? formatDate(row.date) : '-'}</td>
                      <td className="py-2 text-neutral-900">{row.description || '-'}</td>
                      <td className="py-2 text-neutral-700">
                        {row.type === 'income' ? 'Entrada' : row.type === 'expense' ? 'Saida' : '-'}
                      </td>
                      <td className="py-2 text-right text-neutral-900">
                        {row.amount ? formatCurrency(row.amount) : '-'}
                      </td>
                      <td className="py-2">
                        <RowStatus row={row} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      <section className="card">
        <div className="card-header">
          <h2 className="card-title">Historico de importacoes</h2>
          <p className="card-subtitle">Cada lote fica registrado para auditoria e pode ser desfeito.</p>
        </div>
        <div className="card-body">
          {batchesQ.isLoading && <p className="text-sm text-neutral-500">Carregando...</p>}
          {!batchesQ.isLoading && batches.length === 0 && (
            <div data-testid="importacao-historico-vazio" className="flex items-center gap-3 text-sm text-neutral-600">
              <Upload className="h-5 w-5 text-neutral-400" />
              Nenhuma importacao realizada ainda.
            </div>
          )}
          <ul data-testid="importacao-historico" className="divide-y divide-neutral-100">
            {batches.map((batch) => (
              <li
                key={batch.id}
                data-testid={`importacao-lote-${batch.id}`}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-neutral-900">
                      {batch.fileName ?? `Arquivo ${batch.format.toUpperCase()}`}
                    </span>
                    <span className={cls('badge', batchBadge(batch.status))}>{batchLabel(batch.status)}</span>
                  </div>
                  <div className="text-xs text-neutral-500">
                    {accountName(batch.accountId)} · {batch.rowCount} linhas · {batch.importedCount}{' '}
                    importadas · {batch.duplicateCount} duplicadas · {batch.invalidCount} invalidas
                  </div>
                </div>
                {batch.status === 'committed' && (
                  <button
                    type="button"
                    className="btn-outline"
                    data-testid={`importacao-desfazer-${batch.id}`}
                    disabled={busy}
                    onClick={() => undoImport(batch)}
                  >
                    <Undo2 className="h-4 w-4" /> Desfazer
                  </button>
                )}
              </li>
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
        <div className={cls('mt-1 text-2xl font-semibold', tone)}>{value}</div>
      </div>
    </div>
  );
}

function RowStatus({ row }: { row: ImportRow }) {
  if (row.status === 'invalid') {
    return (
      <span className="text-xs text-danger-700">
        Invalida{row.errors.length > 0 ? ` (${row.errors.join(', ')})` : ''}
      </span>
    );
  }
  if (row.status === 'duplicate') {
    return (
      <span className="text-xs text-warning-700">
        Duplicada{row.duplicateOf === 'existing' ? ' (ja existente)' : ' (no arquivo)'}
      </span>
    );
  }
  return <span className="text-xs text-success-700">Valida</span>;
}

function batchLabel(status: ImportBatchStatus): string {
  switch (status) {
    case 'committed':
      return 'Importado';
    case 'undone':
      return 'Desfeito';
    default:
      return 'Previa';
  }
}

function batchBadge(status: ImportBatchStatus): string {
  switch (status) {
    case 'committed':
      return 'border-success-200 bg-success-50 text-success-700';
    case 'undone':
      return 'border-neutral-200 bg-neutral-50 text-neutral-600';
    default:
      return 'border-warning-200 bg-warning-50 text-warning-700';
  }
}

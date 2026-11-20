'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Fragment, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '@/components/auth/AuthContext';
import { apiFetch, API_BASE_URL, getAuthToken } from '@/lib/api-client';
import { formatCurrency, cls } from '@/lib/format';
import type { Transaction, Category, Attachment } from '@scf/api-contracts';
import {
  ArrowDownRight,
  ArrowLeftRight,
  ArrowUpRight,
  Download,
  Paperclip,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';

export default function TransactionsPage() {
  const { currentSpaceId } = useAuth();
  const [type, setType] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [q, setQ] = useState('');
  const [tag, setTag] = useState('');
  const [attachmentsFor, setAttachmentsFor] = useState<string | null>(null);

  const params = useMemo(() => {
    const sp = new URLSearchParams();
    if (type) sp.set('type', type);
    if (status) sp.set('status', status);
    if (from) sp.set('from', from);
    if (to) sp.set('to', to);
    if (q) sp.set('q', q);
    if (tag) sp.set('tag', tag);
    return sp.toString();
  }, [type, status, from, to, q, tag]);

  const transactionsQ = useQuery({
    queryKey: ['transactions', currentSpaceId, params],
    enabled: !!currentSpaceId,
    queryFn: () =>
      apiFetch<{ items: Transaction[]; total: number; nextCursor?: string }>(
        `/financial-spaces/${currentSpaceId}/transactions?${params}&limit=50`,
      ),
  });
  const _categoriesQ = useQuery({
    queryKey: ['categories', currentSpaceId],
    enabled: !!currentSpaceId,
    queryFn: () => apiFetch<Category[]>(`/financial-spaces/${currentSpaceId}/categories`),
  });
  void _categoriesQ;

  const items = transactionsQ.data?.items ?? [];
  const total = transactionsQ.data?.total ?? 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Lancamentos</h1>
          <p className="text-sm text-neutral-500">
            Receitas, despesas, transferencias e ajustes. {total} registros.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/app/transactions/new" className="btn-primary">
            <Plus className="h-4 w-4" /> Novo lancamento
          </Link>
        </div>
      </header>

      <section className="card">
        <div className="card-body grid gap-3 md:grid-cols-6">
          <div className="md:col-span-2">
            <label className="label block">Pesquisar</label>
            <div className="relative mt-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <input
                className="input pl-9"
                placeholder="Descricao ou observacao"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="label block">Tipo</label>
            <select className="input mt-1" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">Todos</option>
              <option value="income">Receita</option>
              <option value="expense">Despesa</option>
              <option value="transfer">Transferencia</option>
              <option value="adjustment">Ajuste</option>
            </select>
          </div>
          <div>
            <label className="label block">Data inicial</label>
            <input type="date" className="input mt-1" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="label block">Data final</label>
            <input type="date" className="input mt-1" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <label className="label block">Etiqueta</label>
            <input
              className="input mt-1"
              placeholder="Ex.: viagem"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
            />
          </div>
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="card-header flex-row items-center justify-between">
          <div>
            <h2 className="card-title">Historico</h2>
            <p className="card-subtitle">Ordenado por data decrescente</p>
          </div>
          <div className="hidden items-center gap-2 md:flex">
            <div className="badge border-neutral-200 bg-neutral-50 text-neutral-700">
              <SlidersHorizontal className="mr-1 h-3 w-3" /> Filtros aplicados
            </div>
            <select className="input w-auto h-9 py-1 text-xs" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Todos os status</option>
              <option value="confirmed">Confirmado</option>
              <option value="pending">Pendente</option>
              <option value="scheduled">Previsto</option>
              <option value="canceled">Cancelado</option>
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-6 py-3 font-medium">Descricao</th>
                <th className="px-6 py-3 font-medium">Data</th>
                <th className="px-6 py-3 font-medium">Categoria</th>
                <th className="px-6 py-3 font-medium">Etiquetas</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 text-right font-medium">Valor</th>
                <th className="px-6 py-3 text-right font-medium">Anexos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {transactionsQ.isLoading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>
                      <td className="px-6 py-4"><div className="h-4 w-2/3 animate-pulse rounded bg-neutral-100" /></td>
                      <td className="px-6 py-4"><div className="h-4 w-20 animate-pulse rounded bg-neutral-100" /></td>
                      <td className="px-6 py-4"><div className="h-4 w-24 animate-pulse rounded bg-neutral-100" /></td>
                      <td className="px-6 py-4"><div className="h-4 w-16 animate-pulse rounded bg-neutral-100" /></td>
                      <td className="px-6 py-4"><div className="h-5 w-20 animate-pulse rounded bg-neutral-100" /></td>
                      <td className="px-6 py-4"><div className="ml-auto h-5 w-24 animate-pulse rounded bg-neutral-100" /></td>
                      <td className="px-6 py-4"><div className="ml-auto h-5 w-24 animate-pulse rounded bg-neutral-100" /></td>
                    </tr>
                  ))
                : items.length === 0
                ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-10 text-center text-neutral-500">
                        Nenhum lancamento encontrado com os filtros aplicados.
                      </td>
                    </tr>
                  )
                : items.map((t) => {
                    const cat = (t as any).category;
                    return (
                      <Fragment key={t.id}>
                      <tr className="hover:bg-neutral-50">
                        <td className="px-6 py-3">
                          <div className="flex items-center gap-3">
                            <span className={
                              cls('grid h-9 w-9 place-items-center rounded-md',
                                t.type === 'income' ? 'bg-success-50 text-success-700' :
                                t.type === 'expense' ? 'bg-danger-50 text-danger-700' :
                                'bg-neutral-100 text-neutral-700')
                            }>
                              {t.type === 'income' ? <ArrowUpRight className="h-4 w-4" /> :
                               t.type === 'expense' ? <ArrowDownRight className="h-4 w-4" /> :
                               <ArrowLeftRight className="h-4 w-4" />}
                            </span>
                            <div className="min-w-0">
                              <div className="truncate font-medium text-neutral-900">{t.description}</div>
                              {t.notes && <div className="truncate text-xs text-neutral-500">{t.notes}</div>}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-3 text-neutral-700">{t.effectiveDate}</td>
                        <td className="px-6 py-3 text-neutral-700">
                          {cat ? (
                            <span className="inline-flex items-center gap-1.5">
                              <span className="h-2 w-2 rounded-full" style={{ background: cat.color ?? '#cbd5e1' }} />
                              {cat.name}
                            </span>
                          ) : (
                            <span className="text-neutral-400">Sem categoria</span>
                          )}
                        </td>
                        <td className="px-6 py-3">
                          <div className="flex flex-wrap gap-1">
                            {(t.tags ?? []).length === 0 ? (
                              <span className="text-neutral-400">—</span>
                            ) : (
                              (t.tags ?? []).map((tg) => (
                                <button
                                  key={tg}
                                  type="button"
                                  onClick={() => setTag(tg)}
                                  title={`Filtrar por ${tg}`}
                                  className="badge border-neutral-200 bg-neutral-50 text-neutral-700 hover:bg-neutral-100"
                                >
                                  {tg}
                                </button>
                              ))
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-3">
                          <span className={`badge ${statusBadge(t.status)}`}>{t.status}</span>
                        </td>
                        <td className="px-6 py-3 text-right font-semibold">
                          <span className={
                            t.type === 'income' ? 'text-success-700' :
                            t.type === 'expense' ? 'text-danger-700' :
                            'text-neutral-900'
                          }>
                            {t.type === 'income' ? '+' : t.type === 'expense' ? '-' : ''} {formatCurrency(t.totalAmount)}
                          </span>
                        </td>
                        <td className="px-6 py-3 text-right">
                          <button
                            type="button"
                            className="btn-outline"
                            data-testid={`comprovantes-${t.id}`}
                            onClick={() => setAttachmentsFor((cur) => (cur === t.id ? null : t.id))}
                          >
                            <Paperclip className="h-4 w-4" /> Comprovantes
                          </button>
                        </td>
                      </tr>
                      {attachmentsFor === t.id && (
                        <tr className="bg-neutral-50">
                          <td colSpan={7} className="px-6 py-4">
                            <AttachmentsPanel spaceId={currentSpaceId} transactionId={t.id} />
                          </td>
                        </tr>
                      )}
                      </Fragment>
                    );
                  })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function AttachmentsPanel({
  spaceId,
  transactionId,
}: {
  spaceId: string | null;
  transactionId: string;
}) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const queryKey = ['attachments', spaceId, transactionId] as const;
  const listQ = useQuery({
    queryKey,
    enabled: !!spaceId,
    queryFn: () =>
      apiFetch<{ items: Attachment[] }>(
        `/financial-spaces/${spaceId}/transactions/${transactionId}/attachments`,
      ),
  });
  const items = listQ.data?.items ?? [];

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!spaceId) return;
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError('Selecione um arquivo para anexar.');
      return;
    }
    setError(null);
    setFlash(null);
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      await apiFetch(`/financial-spaces/${spaceId}/transactions/${transactionId}/attachments`, {
        method: 'POST',
        body: form,
      });
      if (fileRef.current) fileRef.current.value = '';
      setFlash('Comprovante anexado.');
      await qc.invalidateQueries({ queryKey });
    } catch (err: any) {
      setError(err?.details?.message ?? err?.message ?? 'Nao foi possivel anexar o comprovante');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!spaceId) return;
    setError(null);
    try {
      await apiFetch(
        `/financial-spaces/${spaceId}/transactions/${transactionId}/attachments/${id}`,
        { method: 'DELETE' },
      );
      await qc.invalidateQueries({ queryKey });
    } catch (err: any) {
      setError(err?.details?.message ?? err?.message ?? 'Nao foi possivel remover o comprovante');
    }
  }

  async function download(a: Attachment) {
    if (!spaceId) return;
    setError(null);
    const token = getAuthToken();
    const res = await fetch(
      `${API_BASE_URL}/financial-spaces/${spaceId}/transactions/${transactionId}/attachments/${a.id}/download`,
      { headers: token ? { authorization: `Bearer ${token}` } : {} },
    );
    if (!res.ok) {
      setError('Nao foi possivel baixar o comprovante');
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = a.fileName;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3" data-testid="comprovantes-painel">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-neutral-900">Comprovantes</p>
          <p className="text-xs text-neutral-500">PNG, JPEG, WEBP ou PDF, ate 5 MB.</p>
        </div>
        <form className="flex items-end gap-2" onSubmit={submit}>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,application/pdf"
            data-testid="comprovante-arquivo"
            className="input h-9 py-1 text-xs"
          />
          <button type="submit" className="btn-primary" data-testid="comprovante-enviar" disabled={busy}>
            {busy ? 'Enviando...' : 'Anexar'}
          </button>
        </form>
      </div>

      {error && (
        <div className="rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700">
          {error}
        </div>
      )}
      {flash && (
        <div className="rounded-md border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-700">
          {flash}
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-neutral-500">Nenhum comprovante anexado.</p>
      ) : (
        <ul className="divide-y divide-neutral-200 rounded-md border border-neutral-200 bg-white">
          {items.map((a) => (
            <li
              key={a.id}
              data-testid={`comprovante-${a.id}`}
              className="flex flex-wrap items-center justify-between gap-3 px-3 py-2"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-neutral-900">{a.fileName}</div>
                <div className="text-xs text-neutral-500">
                  {formatBytes(a.size)} · {a.contentType}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-outline"
                  data-testid={`comprovante-baixar-${a.id}`}
                  onClick={() => download(a)}
                >
                  <Download className="h-4 w-4" /> Baixar
                </button>
                <button
                  type="button"
                  className="btn-outline"
                  data-testid={`comprovante-remover-${a.id}`}
                  onClick={() => remove(a.id)}
                >
                  <Trash2 className="h-4 w-4" /> Remover
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function statusBadge(s: string) {
  switch (s) {
    case 'confirmed': return 'border-success-200 bg-success-50 text-success-700';
    case 'pending': return 'border-warning-200 bg-warning-50 text-warning-700';
    case 'scheduled': return 'border-neutral-200 bg-neutral-50 text-neutral-700';
    case 'canceled': return 'border-danger-200 bg-danger-50 text-danger-700';
    default: return 'border-neutral-200 bg-neutral-50 text-neutral-700';
  }
}

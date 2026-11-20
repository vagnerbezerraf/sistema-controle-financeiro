import { useState } from 'react';
import type { FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthContext';
import { apiFetch } from '../lib/api';
import type { CreateExchangeRateRequest, CurrencyCode, ExchangeRate } from '@scf/api-contracts';
import { Check, Coins, Pencil, Plus, Trash2, X } from 'lucide-react';

/** Moedas suportadas pelo dominio (mesmo conjunto do enum `CurrencyCode`). */
const CURRENCIES: CurrencyCode[] = ['BRL', 'USD', 'EUR', 'ARS', 'GBP', 'JPY'];

const today = () => new Date().toISOString().slice(0, 10);

export default function ExchangeRatesPage() {
  const { currentSpaceId } = useAuth();
  const qc = useQueryClient();

  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ratesQ = useQuery({
    queryKey: ['exchange-rates', currentSpaceId],
    enabled: !!currentSpaceId,
    queryFn: () => apiFetch<ExchangeRate[]>(`/financial-spaces/${currentSpaceId}/exchange-rates`),
  });

  const rates = ratesQ.data ?? [];

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ['exchange-rates', currentSpaceId] });
  }

  async function removeRate(rate: ExchangeRate) {
    if (!currentSpaceId) return;
    setError(null);
    try {
      await apiFetch(`/financial-spaces/${currentSpaceId}/exchange-rates/${rate.id}`, {
        method: 'DELETE',
      });
      await refresh();
    } catch (e: any) {
      setError(e?.details?.message ?? e?.message ?? 'Nao foi possivel remover a taxa');
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Taxas de cambio</h1>
          <p className="text-sm text-neutral-500">
            Converta lancamentos de outras moedas para a moeda de reporte do espaco. A taxa vigente e
            a mais recente do par ate a data do lancamento.
          </p>
        </div>
        <button
          type="button"
          className={showCreate ? 'btn-outline' : 'btn-primary'}
          id="taxa-nova"
          onClick={() => setShowCreate((v) => !v)}
        >
          {showCreate ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showCreate ? 'Cancelar' : 'Nova taxa'}
        </button>
      </header>

      {error && (
        <div className="rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700">
          {error}
        </div>
      )}

      {showCreate && (
        <RateForm
          spaceId={currentSpaceId}
          onCreated={async () => {
            setShowCreate(false);
            await refresh();
          }}
        />
      )}

      <section className="card">
        <div className="card-header">
          <h2 className="card-title">Taxas cadastradas</h2>
          <p className="card-subtitle">As taxas mais recentes substituem as anteriores do mesmo par</p>
        </div>
        <div className="card-body">
          {ratesQ.isLoading && <p className="text-sm text-neutral-500">Carregando...</p>}
          {!ratesQ.isLoading && rates.length === 0 && (
            <div className="flex items-center gap-3 text-sm text-neutral-600">
              <Coins className="h-5 w-5 text-neutral-400" />
              Nenhuma taxa cadastrada. Cadastre uma para somar lancamentos de outras moedas.
            </div>
          )}

          <ul className="divide-y divide-neutral-100">
            {rates.map((rate) => (
              <RateRow key={rate.id} rate={rate} spaceId={currentSpaceId} onChanged={refresh} onRemove={removeRate} />
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

function RateRow({
  rate,
  spaceId,
  onChanged,
  onRemove,
}: {
  rate: ExchangeRate;
  spaceId: string | null;
  onChanged: () => Promise<void>;
  onRemove: (rate: ExchangeRate) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(rate.rate);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!spaceId) return;
    setError(null);
    setBusy(true);
    try {
      await apiFetch(`/financial-spaces/${spaceId}/exchange-rates/${rate.id}`, {
        method: 'PATCH',
        json: { rate: value.trim(), version: rate.version },
      });
      setEditing(false);
      await onChanged();
    } catch (e: any) {
      setError(e?.details?.message ?? e?.message ?? 'Nao foi possivel atualizar a taxa');
    } finally {
      setBusy(false);
    }
  }

  return (
    <li id={`taxa-item-${rate.id}`} className="py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-medium text-neutral-900">
            {rate.fromCurrency} &rarr; {rate.toCurrency}
          </div>
          <div className="text-xs text-neutral-500">
            {editing ? (
              <span className="inline-flex items-center gap-2">
                1 {rate.fromCurrency} =
                <input
                  id={`taxa-novo-valor-${rate.id}`}
                  className="input h-8 w-28"
                  inputMode="decimal"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                />
                {rate.toCurrency}
              </span>
            ) : (
              <>
                1 {rate.fromCurrency} = {rate.rate} {rate.toCurrency}
              </>
            )}{' '}
            · vigente desde {rate.asOf}
            {rate.source ? ` · ${rate.source}` : ''}
          </div>
          {error && <div className="mt-1 text-xs text-danger-700">{error}</div>}
        </div>
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <button
                type="button"
                className="btn-primary"
                id={`taxa-salvar-edicao-${rate.id}`}
                onClick={save}
                disabled={busy}
              >
                <Check className="h-4 w-4" /> {busy ? 'Salvando...' : 'Salvar'}
              </button>
              <button type="button" className="btn-outline" onClick={() => setEditing(false)}>
                Cancelar
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="btn-outline"
                id={`taxa-editar-${rate.id}`}
                onClick={() => {
                  setValue(rate.rate);
                  setEditing(true);
                }}
              >
                <Pencil className="h-4 w-4" /> Editar
              </button>
              <button
                type="button"
                className="btn-outline"
                id={`taxa-remover-${rate.id}`}
                onClick={() => onRemove(rate)}
              >
                <Trash2 className="h-4 w-4" /> Remover
              </button>
            </>
          )}
        </div>
      </div>
    </li>
  );
}

function RateForm({ spaceId, onCreated }: { spaceId: string | null; onCreated: () => void }) {
  const [fromCurrency, setFromCurrency] = useState<CurrencyCode>('USD');
  const [toCurrency, setToCurrency] = useState<CurrencyCode>('BRL');
  const [rate, setRate] = useState('');
  const [asOf, setAsOf] = useState(today());
  const [source, setSource] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sameCurrency = fromCurrency === toCurrency;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!spaceId) return;
    setError(null);
    setBusy(true);
    try {
      const body: CreateExchangeRateRequest = {
        fromCurrency,
        toCurrency,
        rate: rate.trim(),
        ...(asOf ? { asOf } : {}),
        ...(source.trim() ? { source: source.trim() } : {}),
      };
      await apiFetch(`/financial-spaces/${spaceId}/exchange-rates`, { method: 'POST', json: body });
      setRate('');
      setSource('');
      onCreated();
    } catch (e: any) {
      setError(e?.details?.message ?? e?.message ?? 'Nao foi possivel criar a taxa');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <div className="card-header">
        <h2 className="card-title text-lg">Nova taxa</h2>
        <p className="card-subtitle">
          Informe quantas unidades da moeda de destino valem 1 unidade da moeda de origem.
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
            <label htmlFor="taxa-de" className="label block">
              Moeda de origem
            </label>
            <select
              id="taxa-de"
              className="input mt-1"
              value={fromCurrency}
              onChange={(e) => setFromCurrency(e.target.value as CurrencyCode)}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="taxa-para" className="label block">
              Moeda de destino
            </label>
            <select
              id="taxa-para"
              className="input mt-1"
              value={toCurrency}
              onChange={(e) => setToCurrency(e.target.value as CurrencyCode)}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="taxa-valor" className="label block">
              Taxa
            </label>
            <input
              id="taxa-valor"
              className="input mt-1"
              inputMode="decimal"
              placeholder="Ex.: 5.2500"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="taxa-data" className="label block">
              Vigente a partir de
            </label>
            <input
              id="taxa-data"
              type="date"
              className="input mt-1"
              value={asOf}
              onChange={(e) => setAsOf(e.target.value)}
              required
            />
          </div>
          <div className="md:col-span-2">
            <label htmlFor="taxa-fonte" className="label block">
              Fonte (opcional)
            </label>
            <input
              id="taxa-fonte"
              className="input mt-1"
              placeholder="Ex.: Banco Central"
              value={source}
              onChange={(e) => setSource(e.target.value)}
            />
          </div>
        </div>
        {sameCurrency && (
          <p className="text-xs text-warning-700">As moedas de origem e destino devem ser diferentes.</p>
        )}
        <button type="submit" className="btn-primary" id="taxa-salvar" disabled={busy || sameCurrency}>
          {busy ? 'Criando...' : (<><Check className="h-4 w-4" /> Criar taxa</>)}
        </button>
      </form>
    </section>
  );
}

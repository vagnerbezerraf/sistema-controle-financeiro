'use client';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '@/components/auth/AuthContext';
import { apiFetch } from '@/lib/api-client';
import { formatCurrency, formatDate, cls } from '@/lib/format';
import type { CreateScenarioRequest, ScenarioAdjustment, ScenarioView } from '@scf/api-contracts';
import { AlertTriangle, FlaskConical, Plus, Trash2, TrendingDown } from 'lucide-react';

/** Horizontes oferecidos para a simulacao. */
const HORIZONS = [15, 30, 90];

const todayIso = () => new Date().toISOString().slice(0, 10);

export default function ScenariosPage() {
  const { currentSpaceId } = useAuth();
  const [horizonDays, setHorizonDays] = useState(30);
  const [adjustments, setAdjustments] = useState<ScenarioAdjustment[]>([]);
  const [result, setResult] = useState<ScenarioView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function simulate() {
    if (!currentSpaceId) return;
    setError(null);
    setBusy(true);
    try {
      const body: CreateScenarioRequest = { horizonDays, adjustments };
      const view = await apiFetch<ScenarioView>(
        `/financial-spaces/${currentSpaceId}/summary/scenario`,
        { method: 'POST', json: body },
      );
      setResult(view);
    } catch (e: any) {
      setError(e?.details?.message ?? e?.message ?? 'Nao foi possivel simular o cenario');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cenarios</h1>
          <p className="text-sm text-neutral-500">
            Simule movimentos hipoteticos sobre o saldo projetado sem alterar o historico.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label htmlFor="scenarioHorizon" className="label block">
              Horizonte (dias)
            </label>
            <select
              id="scenarioHorizon"
              data-testid="cenario-horizonte"
              className="input mt-1"
              value={horizonDays}
              onChange={(e) => setHorizonDays(Number(e.target.value))}
            >
              {HORIZONS.map((d) => (
                <option key={d} value={d}>
                  {d} dias
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      <section className="card">
        <div className="card-header">
          <h2 className="card-title">Ajustes hipoteticos</h2>
          <p className="card-subtitle">
            E se eu gastar ou receber algo? Nada e gravado — so entra na simulacao.
          </p>
        </div>
        <div className="card-body space-y-4">
          {error && (
            <div className="rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700">
              {error}
            </div>
          )}

          <AdjustmentForm onAdd={(adjustment) => setAdjustments((list) => [...list, adjustment])} />

          {adjustments.length === 0 ? (
            <div
              data-testid="cenario-vazio"
              className="flex items-center gap-3 text-sm text-neutral-600"
            >
              <FlaskConical className="h-5 w-5 text-neutral-400" />
              Nenhum ajuste ainda. Adicione um movimento para ver o impacto.
            </div>
          ) : (
            <ul data-testid="cenario-ajustes" className="divide-y divide-neutral-100">
              {adjustments.map((adjustment, index) => (
                <li
                  key={`${adjustment.description}-${index}`}
                  data-testid={`cenario-ajuste-${index}`}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-neutral-900">{adjustment.description}</div>
                    <div className="text-xs text-neutral-500">
                      {formatDate(adjustment.date)} ·{' '}
                      {adjustment.type === 'income' ? 'Entrada' : 'Saida'}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={cls(
                        'text-sm font-semibold',
                        adjustment.type === 'income' ? 'text-success-700' : 'text-danger-700',
                      )}
                    >
                      {adjustment.type === 'income' ? '+' : '-'}
                      {formatCurrency(adjustment.amount)}
                    </span>
                    <button
                      type="button"
                      className="btn-outline"
                      data-testid={`cenario-ajuste-remover-${index}`}
                      onClick={() => setAdjustments((list) => list.filter((_, i) => i !== index))}
                    >
                      <Trash2 className="h-4 w-4" /> Remover
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            className="btn-primary"
            data-testid="cenario-simular"
            disabled={busy}
            onClick={simulate}
          >
            <FlaskConical className="h-4 w-4" /> {busy ? 'Simulando...' : 'Simular cenario'}
          </button>
        </div>
      </section>

      {result && (
        <section className="space-y-4" data-testid="cenario-resultado">
          <div className="grid gap-4 md:grid-cols-3">
            <SummaryCard
              testid="cenario-saldo-real"
              label="Saldo realizado"
              value={result.base.openingBalance}
              tone="text-neutral-900"
            />
            <SummaryCard
              testid="cenario-saldo-final"
              label={`Saldo em ${result.scenario.horizonDays} dias (cenario)`}
              value={result.scenario.closingBalance}
              tone={Number(result.scenario.closingBalance) < 0 ? 'text-danger-700' : 'text-brand-700'}
            />
            <SummaryCard
              testid="cenario-menor-saldo"
              label="Menor saldo no periodo"
              value={result.scenario.minBalance}
              tone={result.scenario.willGoNegative ? 'text-danger-700' : 'text-neutral-900'}
            />
          </div>

          <div
            data-testid="cenario-impacto"
            className={cls(
              'flex flex-wrap items-center gap-3 rounded-md border px-4 py-3 text-sm',
              result.impact.improves
                ? 'border-success-200 bg-success-50 text-success-700'
                : 'border-danger-200 bg-danger-50 text-danger-700',
            )}
          >
            <TrendingDown className="h-5 w-5" />
            <span>
              Impacto no saldo final:{' '}
              <strong data-testid="cenario-impacto-valor">
                {Number(result.impact.closingBalanceDelta) > 0 ? '+' : ''}
                {formatCurrency(result.impact.closingBalanceDelta)}
              </strong>
            </span>
            <span className="text-neutral-500" data-testid="cenario-impacto-menor">
              Pior momento: {Number(result.impact.minBalanceDelta) > 0 ? '+' : ''}
              {formatCurrency(result.impact.minBalanceDelta)}
            </span>
          </div>

          {result.scenario.willGoNegative && (
            <div
              data-testid="cenario-aviso-negativo"
              className="flex items-center gap-3 rounded-md border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700"
            >
              <AlertTriangle className="h-5 w-5" />
              No cenario o saldo fica negativo em {formatDate(result.scenario.minBalanceDate)} (
              {formatCurrency(result.scenario.minBalance)}).
            </div>
          )}

          {result.scenario.points.length > 0 && (
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">Movimentos do cenario</h2>
              </div>
              <div className="card-body">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-neutral-500">
                      <th className="py-2">Dia</th>
                      <th className="py-2 text-right">Entradas</th>
                      <th className="py-2 text-right">Saidas</th>
                      <th className="py-2 text-right">Saldo do dia</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {result.scenario.points.map((point) => (
                      <tr key={point.date} data-testid={`cenario-ponto-${point.date}`}>
                        <td className="py-2 text-neutral-700">{formatDate(point.date)}</td>
                        <td className="py-2 text-right text-success-700">
                          {Number(point.inflow) > 0 ? formatCurrency(point.inflow) : '-'}
                        </td>
                        <td className="py-2 text-right text-neutral-900">
                          {Number(point.outflow) > 0 ? formatCurrency(point.outflow) : '-'}
                        </td>
                        <td
                          className={cls(
                            'py-2 text-right font-semibold',
                            Number(point.balance) < 0 ? 'text-danger-700' : 'text-neutral-900',
                          )}
                        >
                          {formatCurrency(point.balance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}
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
  value: string;
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

function AdjustmentForm({ onAdd }: { onAdd: (adjustment: ScenarioAdjustment) => void }) {
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'income' | 'expense'>('expense');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayIso());

  function submit(e: FormEvent) {
    e.preventDefault();
    onAdd({ description: description.trim(), type, amount: amount.trim(), date });
    setDescription('');
    setAmount('');
  }

  return (
    <form className="grid gap-3 md:grid-cols-[2fr_1fr_1fr_1fr_auto]" onSubmit={submit}>
      <div>
        <label htmlFor="scenarioDescription" className="label block">
          Descricao
        </label>
        <input
          id="scenarioDescription"
          data-testid="cenario-ajuste-descricao"
          className="input mt-1"
          placeholder="Ex.: Comprar notebook"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
        />
      </div>
      <div>
        <label htmlFor="scenarioType" className="label block">
          Tipo
        </label>
        <select
          id="scenarioType"
          data-testid="cenario-ajuste-tipo"
          className="input mt-1"
          value={type}
          onChange={(e) => setType(e.target.value as 'income' | 'expense')}
        >
          <option value="expense">Saida</option>
          <option value="income">Entrada</option>
        </select>
      </div>
      <div>
        <label htmlFor="scenarioAmount" className="label block">
          Valor
        </label>
        <input
          id="scenarioAmount"
          data-testid="cenario-ajuste-valor"
          className="input mt-1"
          inputMode="decimal"
          placeholder="Ex.: 300.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
      </div>
      <div>
        <label htmlFor="scenarioDate" className="label block">
          Data
        </label>
        <input
          id="scenarioDate"
          data-testid="cenario-ajuste-data"
          className="input mt-1"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
        />
      </div>
      <div className="flex items-end">
        <button type="submit" className="btn-outline" data-testid="cenario-ajuste-adicionar">
          <Plus className="h-4 w-4" /> Adicionar
        </button>
      </div>
    </form>
  );
}

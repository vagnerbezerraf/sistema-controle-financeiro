'use client';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/components/auth/AuthContext';
import { apiFetch } from '@/lib/api-client';
import { formatCurrency, cls, monthLabel } from '@/lib/format';
import type { CalendarDay, CalendarEntry, CalendarView } from '@scf/api-contracts';
import { CalendarRange, ChevronLeft, ChevronRight } from 'lucide-react';

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];

/** Data de hoje no fuso do usuario (o calendario e navegado por mes local). */
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function currentMonth(): string {
  return todayIso().slice(0, 7);
}

/** Primeiro e ultimo dia do mes (`YYYY-MM`). */
function monthBounds(ym: string): { from: string; to: string } {
  const [y, m] = ym.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const last = new Date(Date.UTC(y, m, 0));
  return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) };
}

/** Meses navegados dentro de um mes (`YYYY-MM`). */
function addMonths(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Celulas da grade do mes: `null` nos espacos antes do dia 1 e depois do ultimo. */
function monthCells(ym: string): Array<string | null> {
  const [y, m] = ym.split('-').map(Number);
  const offset = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const total = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: Array<string | null> = Array.from({ length: offset }, () => null);
  for (let day = 1; day <= total; day += 1) {
    cells.push(new Date(Date.UTC(y, m - 1, day)).toISOString().slice(0, 10));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/** Valor curto para as celulas da grade (`R$ 1,5 mil` vira ruido; aqui, so o numero). */
function shortMoney(value: string): string {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(Number(value));
}

export default function CalendarPage() {
  const { currentSpaceId } = useAuth();
  const [month, setMonth] = useState(currentMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(todayIso());

  const range = useMemo(() => monthBounds(month), [month]);
  const calendarQ = useQuery({
    queryKey: ['calendar', currentSpaceId, range.from, range.to],
    enabled: !!currentSpaceId,
    queryFn: () =>
      apiFetch<CalendarView>(
        `/financial-spaces/${currentSpaceId}/calendar?from=${range.from}&to=${range.to}`,
      ),
  });

  const data = calendarQ.data;
  const daysByDate = useMemo(() => {
    const map = new Map<string, CalendarDay>();
    for (const day of data?.days ?? []) map.set(day.date, day);
    return map;
  }, [data]);

  const cells = useMemo(() => monthCells(month), [month]);
  const selected = selectedDate ? daysByDate.get(selectedDate) : undefined;
  const today = todayIso();

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Calendario financeiro</h1>
          <p className="text-sm text-neutral-500">
            Vencimentos de contas e faturas, sem distorcer o saldo realizado.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn-outline"
            data-testid="calendario-mes-anterior"
            onClick={() => setMonth((m) => addMonths(m, -1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="min-w-[10rem] text-center text-sm font-medium capitalize text-neutral-900">
            {monthLabel(month)}
          </div>
          <button
            type="button"
            className="btn-outline"
            data-testid="calendario-mes-proximo"
            onClick={() => setMonth((m) => addMonths(m, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="btn-outline"
            data-testid="calendario-hoje"
            onClick={() => {
              setMonth(currentMonth());
              setSelectedDate(today);
            }}
          >
            Hoje
          </button>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-4">
        <SummaryCard label="A receber (mes)" value={data?.totals.income} tone="text-success-700" />
        <SummaryCard label="A pagar (mes)" value={data?.totals.expense} tone="text-danger-700" />
        <SummaryCard label="Liquido previsto" value={data?.totals.net} tone="text-neutral-900" />
        <div className="card">
          <div className="card-body">
            <div className="text-xs uppercase tracking-wide text-neutral-500">Vencidas</div>
            <div className="mt-1 text-2xl font-semibold text-warning-700">
              {data?.totals.overdueCount ?? 0}
            </div>
          </div>
        </div>
      </section>

      {calendarQ.isLoading && <p className="text-sm text-neutral-500">Carregando...</p>}

      <section className="card">
        <div className="card-body">
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium uppercase tracking-wide text-neutral-500">
            {WEEKDAYS.map((w) => (
              <div key={w} className="py-2">
                {w}
              </div>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {cells.map((date, index) => {
              if (!date) return <div key={`empty-${index}`} className="min-h-[5rem] rounded-md" />;
              const day = daysByDate.get(date);
              const hasOverdue = (day?.entries ?? []).some((e) => e.overdue);
              return (
                <button
                  key={date}
                  type="button"
                  data-testid={`calendario-dia-${date}`}
                  onClick={() => setSelectedDate(date)}
                  className={cls(
                    'min-h-[5rem] rounded-md border p-1.5 text-left align-top transition-colors',
                    date === selectedDate
                      ? 'border-brand-400 bg-brand-50'
                      : 'border-neutral-200 hover:bg-neutral-50',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={cls(
                        'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium',
                        date === today ? 'bg-brand-600 text-white' : 'text-neutral-700',
                      )}
                    >
                      {Number(date.slice(8, 10))}
                    </span>
                    {hasOverdue && (
                      <span className="h-2 w-2 rounded-full bg-warning-500" title="Ha vencimentos" />
                    )}
                  </div>
                  {day && (
                    <div className="mt-1 space-y-0.5 text-[11px] leading-tight">
                      {Number(day.incomeTotal) > 0 && (
                        <div className="text-success-700">+{shortMoney(day.incomeTotal)}</div>
                      )}
                      {Number(day.expenseTotal) > 0 && (
                        <div className="text-danger-700">-{shortMoney(day.expenseTotal)}</div>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <h2 className="card-title">
            {selected ? `Vencimentos de ${formatDay(selected.date)}` : 'Vencimentos do periodo'}
          </h2>
          <p className="card-subtitle">Contas e faturas previstas</p>
        </div>
        <div className="card-body">
          {selected
            ? renderEntries(selected.entries)
            : renderDays(Array.from(daysByDate.values()))}
        </div>
      </section>
    </div>
  );
}

function renderDays(days: CalendarDay[]) {
  const ordered = [...days].sort((a, b) => a.date.localeCompare(b.date));
  if (ordered.length === 0) return <EmptyState />;
  return (
    <div className="space-y-4">
      {ordered.map((day) => (
        <div key={day.date}>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-sm font-medium text-neutral-900">{formatDay(day.date)}</span>
            <span className="text-xs text-neutral-500">
              {Number(day.incomeTotal) > 0 && (
                <span className="text-success-700">+{formatCurrency(day.incomeTotal)} </span>
              )}
              {Number(day.expenseTotal) > 0 && (
                <span className="text-danger-700">-{formatCurrency(day.expenseTotal)}</span>
              )}
            </span>
          </div>
          {renderEntries(day.entries)}
        </div>
      ))}
    </div>
  );
}

function renderEntries(entries: CalendarEntry[]) {
  if (entries.length === 0) return <EmptyState />;
  return (
    <ul className="divide-y divide-neutral-100">
      {entries.map((entry) => (
        <li
          key={entry.id}
          data-testid={`calendario-entrada-${entry.id}`}
          className="flex flex-wrap items-center justify-between gap-2 py-2"
        >
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-neutral-900">{entry.description}</span>
              <span
                className={cls(
                  'rounded px-1.5 py-0.5 text-xs',
                  entry.kind === 'invoice'
                    ? 'bg-warning-50 text-warning-700'
                    : 'bg-neutral-100 text-neutral-600',
                )}
              >
                {entry.kind === 'invoice' ? 'fatura' : entry.type === 'income' ? 'a receber' : 'a pagar'}
              </span>
              {entry.overdue && (
                <span className="badge border-warning-200 bg-warning-50 text-warning-700">vencida</span>
              )}
            </div>
          </div>
          <div className={cls('font-semibold', entry.type === 'income' ? 'text-success-700' : 'text-neutral-900')}>
            {formatCurrency(entry.amount)}
          </div>
        </li>
      ))}
    </ul>
  );
}

function EmptyState() {
  return (
    <div className="flex items-center gap-3 text-sm text-neutral-600">
      <CalendarRange className="h-5 w-5 text-neutral-400" />
      Nenhum vencimento neste periodo.
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value?: string; tone: string }) {
  return (
    <div className="card">
      <div className="card-body">
        <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
        <div className={cls('mt-1 text-2xl font-semibold', tone)}>{formatCurrency(value ?? '0')}</div>
      </div>
    </div>
  );
}

function formatDay(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  });
}

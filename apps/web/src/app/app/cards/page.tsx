'use client';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/components/auth/AuthContext';
import { apiFetch } from '@/lib/api-client';
import { formatCurrency, formatDate, cls } from '@/lib/format';
import type { Account, CreditCard, Invoice, InvoiceStatus, CreateCreditCardRequest } from '@scf/api-contracts';
import { CreditCard as CreditCardIcon, Plus, X } from 'lucide-react';

export default function CardsPage() {
  const { currentSpaceId } = useAuth();
  const qc = useQueryClient();

  const cardsQ = useQuery({
    queryKey: ['credit-cards', currentSpaceId],
    enabled: !!currentSpaceId,
    queryFn: () => apiFetch<CreditCard[]>(`/financial-spaces/${currentSpaceId}/credit-cards`),
  });
  const accountsQ = useQuery({
    queryKey: ['accounts', currentSpaceId],
    enabled: !!currentSpaceId,
    queryFn: () => apiFetch<Account[]>(`/financial-spaces/${currentSpaceId}/accounts`),
  });

  const cards = cardsQ.data ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => {
    if (!selectedId && cards.length) setSelectedId(cards[0].id);
  }, [cards, selectedId]);
  const selected = cards.find((c) => c.id === selectedId) ?? null;

  const invoicesQ = useQuery({
    queryKey: ['invoices', currentSpaceId, selectedId],
    enabled: !!currentSpaceId && !!selectedId,
    queryFn: () =>
      apiFetch<Invoice[]>(`/financial-spaces/${currentSpaceId}/credit-cards/${selectedId}/invoices`),
  });
  const invoices = invoicesQ.data ?? [];

  // Contas elegiveis para pagar a fatura: qualquer conta, menos a conta tecnica
  // do proprio cartao selecionado (a API recusa a origem igual ao cartao).
  const payAccounts = (accountsQ.data ?? []).filter((a) => a.id !== selected?.accountId);

  const [showCreate, setShowCreate] = useState(false);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payAccount, setPayAccount] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [payError, setPayError] = useState<string | null>(null);
  const [payBusy, setPayBusy] = useState(false);

  const payingInvoice = invoices.find((i) => i.closingDate === payingId) ?? null;

  function openPay(closingDate: string) {
    setPayingId(closingDate);
    setPayError(null);
    setPayAmount('');
    setPayAccount(payAccounts[0]?.id ?? '');
  }

  function closePay() {
    setPayingId(null);
    setPayError(null);
    setPayAmount('');
  }

  async function submitPay(inv: Invoice) {
    if (!currentSpaceId || !selected) return;
    setPayError(null);
    setPayBusy(true);
    try {
      await apiFetch(
        `/financial-spaces/${currentSpaceId}/credit-cards/${selected.id}/invoices/${inv.closingDate}/pay`,
        {
          method: 'POST',
          json: {
            fromAccountId: payAccount,
            ...(payAmount.trim() ? { amount: payAmount.trim() } : {}),
          },
        },
      );
      closePay();
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['invoices', currentSpaceId, selected.id] }),
        qc.invalidateQueries({ queryKey: ['accounts', currentSpaceId] }),
        qc.invalidateQueries({ queryKey: ['transactions', currentSpaceId] }),
      ]);
    } catch (e: any) {
      setPayError(e?.details?.message ?? e?.message ?? 'Nao foi possivel pagar a fatura');
    } finally {
      setPayBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cartoes e faturas</h1>
          <p className="text-sm text-neutral-500">
            Compras agrupadas por ciclo de fechamento, com pagamento por transferencia.
          </p>
        </div>
        <button
          type="button"
          className={showCreate ? 'btn-outline' : 'btn-primary'}
          data-testid="novo-cartao"
          onClick={() => setShowCreate((v) => !v)}
        >
          {showCreate ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showCreate ? 'Cancelar' : 'Novo cartao'}
        </button>
      </header>

      {showCreate && (
        <CreateCardForm
          spaceId={currentSpaceId}
          onCreated={async () => {
            setShowCreate(false);
            await qc.invalidateQueries({ queryKey: ['credit-cards', currentSpaceId] });
          }}
        />
      )}

      {cards.length === 0 && !cardsQ.isLoading && (
        <div className="card">
          <div className="card-body flex items-center gap-3 text-sm text-neutral-600">
            <CreditCardIcon className="h-5 w-5 text-neutral-400" />
            Nenhum cartao cadastrado. Crie um cartao para acompanhar faturas.
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
        <section className="space-y-3">
          {cards.map((c) => (
            <button
              key={c.id}
              type="button"
              data-testid={`cartao-${c.name}`}
              onClick={() => setSelectedId(c.id)}
              className={cls(
                'card w-full text-left transition duration-fast hover:-translate-y-0.5 hover:shadow-md',
                selectedId === c.id && 'ring-2 ring-brand-500',
              )}
            >
              <div className="card-body">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block h-3 w-3 rounded-full"
                    style={{ background: c.account?.color ?? '#cbd5e1' }}
                  />
                  <span className="font-semibold text-neutral-900">{c.name}</span>
                </div>
                <div className="mt-1 text-xs uppercase tracking-wide text-neutral-500">
                  limite {formatCurrency(c.limit)} · fecha dia {c.closingDay} · vence dia {c.dueDay}
                </div>
              </div>
            </button>
          ))}
        </section>

        <section className="card">
          <div className="card-header">
            <h2 className="card-title">{selected ? `Faturas · ${selected.name}` : 'Faturas'}</h2>
            <p className="card-subtitle">Mais recente primeiro</p>
          </div>
          <div className="card-body">
            {!selected && <p className="text-sm text-neutral-500">Selecione um cartao.</p>}
            {selected && invoicesQ.isLoading && (
              <p className="text-sm text-neutral-500">Carregando faturas...</p>
            )}
            {selected && !invoicesQ.isLoading && invoices.length === 0 && (
              <p className="text-sm text-neutral-500">
                Nenhuma fatura. As compras lancadas no cartao aparecem aqui.
              </p>
            )}

            {payingInvoice && (
              <div className="mb-4 rounded-md border border-neutral-200 bg-neutral-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-neutral-900">
                      Pagar fatura · fechamento {formatDate(payingInvoice.closingDate)}
                    </p>
                    <p className="text-xs text-neutral-500">
                      Em aberto {formatCurrency(payingInvoice.outstandingAmount)}
                    </p>
                  </div>
                  <button type="button" className="btn-outline" onClick={closePay} disabled={payBusy}>
                    <X className="h-4 w-4" /> Fechar
                  </button>
                </div>

                {payError && (
                  <div className="mt-3 rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700">
                    {payError}
                  </div>
                )}

                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div>
                    <label htmlFor="payAccount" className="label block">
                      Conta de origem
                    </label>
                    <select
                      id="payAccount"
                      data-testid="pagar-conta"
                      className="input mt-1"
                      value={payAccount}
                      onChange={(e) => setPayAccount(e.target.value)}
                    >
                      {payAccounts.length === 0 && <option value="">Nenhuma conta disponivel</option>}
                      {payAccounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="payAmount" className="label block">
                      Valor (opcional)
                    </label>
                    <input
                      id="payAmount"
                      data-testid="pagar-valor"
                      className="input mt-1"
                      inputMode="decimal"
                      placeholder={payingInvoice.outstandingAmount}
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                    />
                    <p className="mt-1 text-xs text-neutral-500">
                      Deixe em branco para quitar o valor em aberto.
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    className="btn-primary"
                    data-testid="pagar-confirmar"
                    onClick={() => submitPay(payingInvoice)}
                    disabled={payBusy || !payAccount}
                  >
                    {payBusy ? 'Pagando...' : 'Confirmar pagamento'}
                  </button>
                </div>
              </div>
            )}

            <ul className="divide-y divide-neutral-100">
              {invoices.map((inv) => (
                <li key={inv.id} data-testid={`fatura-${inv.closingDate}`} className="py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-medium text-neutral-900">
                        Fechamento {formatDate(inv.closingDate)}
                      </div>
                      <div className="text-xs text-neutral-500">
                        ciclo {formatDate(inv.cycleStart)} a {formatDate(inv.cycleEnd)} · vence{' '}
                        {formatDate(inv.dueDate)}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="font-semibold">{formatCurrency(inv.totalAmount)}</div>
                        <div className="text-xs text-neutral-500">
                          pago {formatCurrency(inv.paidAmount)} · aberto{' '}
                          {formatCurrency(inv.outstandingAmount)}
                        </div>
                      </div>
                      <span className={`badge ${invoiceBadge(inv.status)}`}>
                        {invoiceLabel(inv.status)}
                      </span>
                      {inv.status !== 'paid' && (
                        <button
                          type="button"
                          className="btn-outline"
                          data-testid={`pagar-${inv.closingDate}`}
                          onClick={() => openPay(inv.closingDate)}
                        >
                          Pagar
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}

function CreateCardForm({ spaceId, onCreated }: { spaceId: string | null; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [limit, setLimit] = useState('1000.00');
  const [closingDay, setClosingDay] = useState('25');
  const [dueDay, setDueDay] = useState('5');
  const [institution, setInstitution] = useState('');
  const [color, setColor] = useState('#6366f1');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!spaceId) return;
    setError(null);
    setBusy(true);
    try {
      const body: CreateCreditCardRequest = {
        name: name.trim(),
        limit: limit.trim(),
        closingDay: Number(closingDay),
        dueDay: Number(dueDay),
        color,
        ...(institution.trim() ? { institution: institution.trim() } : {}),
      };
      await apiFetch(`/financial-spaces/${spaceId}/credit-cards`, { method: 'POST', json: body });
      setName('');
      setInstitution('');
      onCreated();
    } catch (e: any) {
      setError(e?.details?.message ?? e?.message ?? 'Nao foi possivel criar o cartao');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <div className="card-header">
        <h2 className="card-title text-lg">Novo cartao</h2>
        <p className="card-subtitle">Cria o cartao e uma conta tecnica para agrupar as compras.</p>
      </div>
      <form className="card-body space-y-4" onSubmit={submit}>
        {error && (
          <div className="rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700">
            {error}
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label htmlFor="cardName" className="label block">
              Nome
            </label>
            <input
              id="cardName"
              data-testid="cartao-nome"
              className="input mt-1"
              placeholder="Ex.: Cartao Nubank"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="cardInstitution" className="label block">
              Instituicao (opcional)
            </label>
            <input
              id="cardInstitution"
              className="input mt-1"
              placeholder="Ex.: Nubank"
              value={institution}
              onChange={(e) => setInstitution(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="cardLimit" className="label block">
              Limite
            </label>
            <input
              id="cardLimit"
              data-testid="cartao-limite"
              className="input mt-1"
              inputMode="decimal"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label htmlFor="cardClosingDay" className="label block">
                Fechamento
              </label>
              <input
                id="cardClosingDay"
                data-testid="cartao-fechamento"
                className="input mt-1"
                type="number"
                min={1}
                max={31}
                value={closingDay}
                onChange={(e) => setClosingDay(e.target.value)}
                required
              />
            </div>
            <div>
              <label htmlFor="cardDueDay" className="label block">
                Vencimento
              </label>
              <input
                id="cardDueDay"
                data-testid="cartao-vencimento"
                className="input mt-1"
                type="number"
                min={1}
                max={31}
                value={dueDay}
                onChange={(e) => setDueDay(e.target.value)}
                required
              />
            </div>
            <div>
              <label htmlFor="cardColor" className="label block">
                Cor
              </label>
              <input
                id="cardColor"
                className="input mt-1 h-10 p-1"
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
              />
            </div>
          </div>
        </div>
        <button type="submit" className="btn-primary" data-testid="cartao-salvar" disabled={busy}>
          {busy ? 'Criando...' : 'Criar cartao'}
        </button>
      </form>
    </section>
  );
}

function invoiceLabel(s: InvoiceStatus) {
  switch (s) {
    case 'paid':
      return 'Paga';
    case 'overdue':
      return 'Vencida';
    case 'closed':
      return 'Fechada';
    default:
      return 'Aberta';
  }
}

function invoiceBadge(s: InvoiceStatus) {
  switch (s) {
    case 'paid':
      return 'border-success-200 bg-success-50 text-success-700';
    case 'overdue':
      return 'border-danger-200 bg-danger-50 text-danger-700';
    case 'closed':
      return 'border-warning-200 bg-warning-50 text-warning-700';
    default:
      return 'border-neutral-200 bg-neutral-50 text-neutral-700';
  }
}

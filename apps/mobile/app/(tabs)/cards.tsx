import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, RefreshControl } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../src/auth/AuthContext';
import { apiFetch } from '../../src/lib/api';
import type {
  Account,
  CreditCard,
  Invoice,
  InvoiceStatus,
  PurchaseInstallmentsRequest,
} from '@scf/api-contracts';
import { CreditCard as CreditCardIcon, Plus, X } from 'lucide-react-native';

function formatCurrency(n: string | number) {
  const v = typeof n === 'string' ? Number(n) : n;
  return isFinite(v) ? `R$ ${v.toFixed(2).replace('.', ',')}` : '-';
}

function formatDate(iso: string) {
  if (!iso) return '-';
  const d = iso.includes('T') ? new Date(iso) : new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('pt-BR');
}

function invoiceLabel(s: InvoiceStatus) {
  switch (s) {
    case 'paid': return 'Paga';
    case 'overdue': return 'Vencida';
    case 'closed': return 'Fechada';
    default: return 'Aberta';
  }
}

const BADGE: Record<InvoiceStatus, string> = {
  paid: 'bg-success-50 text-success-700',
  overdue: 'bg-danger-50 text-danger-700',
  closed: 'bg-warning-50 text-warning-700',
  open: 'bg-neutral-100 text-neutral-700',
};

export default function CardsScreen() {
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

  const payAccounts = (accountsQ.data ?? []).filter((a) => a.id !== selected?.accountId);

  const [showCreate, setShowCreate] = useState(false);
  const [showPurchase, setShowPurchase] = useState(false);
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
    <ScrollView
      className="flex-1 bg-neutral-50"
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={cardsQ.isFetching || invoicesQ.isFetching}
          onRefresh={() => { cardsQ.refetch(); invoicesQ.refetch(); }}
          tintColor="#1e57f5"
        />
      }
    >
      <View className="flex-row items-start justify-between">
        <View className="flex-1">
          <Text className="text-2xl font-bold text-neutral-900">Cartoes e faturas</Text>
          <Text className="text-sm text-neutral-500">Compras por ciclo de fechamento.</Text>
        </View>
        <Pressable
          testID="novo-cartao"
          onPress={() => setShowCreate((v) => !v)}
          className="ml-3 flex-row items-center gap-1 rounded-lg bg-brand-600 px-3 py-2"
        >
          {showCreate ? <X size={16} color="white" /> : <Plus size={16} color="white" />}
          <Text className="text-sm font-medium text-white">{showCreate ? 'Cancelar' : 'Novo'}</Text>
        </Pressable>
      </View>

      {showCreate && (
        <CreateCardForm
          spaceId={currentSpaceId}
          onCreated={async () => {
            setShowCreate(false);
            await qc.invalidateQueries({ queryKey: ['credit-cards', currentSpaceId] });
          }}
        />
      )}

      <View className="mt-5 space-y-3">
        {cards.map((c) => (
          <Pressable
            key={c.id}
            testID={`cartao-${c.name}`}
            onPress={() => setSelectedId(c.id)}
            className={`rounded-xl border bg-white p-4 shadow-sm ${selectedId === c.id ? 'border-brand-500' : 'border-neutral-200'}`}
          >
            <View className="flex-row items-center gap-3">
              <View className="h-3 w-3 rounded-full" style={{ backgroundColor: c.account?.color ?? '#cbd5e1' }} />
              <Text className="font-semibold text-neutral-900">{c.name}</Text>
            </View>
            <Text className="mt-1 text-xs uppercase text-neutral-500">
              limite {formatCurrency(c.limit)} · fecha dia {c.closingDay} · vence dia {c.dueDay}
            </Text>
          </Pressable>
        ))}
        {cards.length === 0 && !cardsQ.isLoading && (
          <View className="flex-row items-center gap-3 rounded-xl border border-neutral-200 bg-white p-4">
            <CreditCardIcon size={18} color="#94a3b8" />
            <Text className="flex-1 text-sm text-neutral-600">
              Nenhum cartao cadastrado. Crie um cartao para acompanhar faturas.
            </Text>
          </View>
        )}
      </View>

      {selected && (
        <View className="mt-6 rounded-xl border border-neutral-200 bg-white shadow-sm">
          <View className="border-b border-neutral-100 p-4">
            <Text className="text-base font-semibold text-neutral-900">Faturas · {selected.name}</Text>
            <Text className="text-xs text-neutral-500 mt-0.5">Mais recente primeiro</Text>
            <Text className="mt-2 text-xs text-neutral-500">
              Lance uma compra; em varias parcelas, cada uma cai na fatura da sua competencia.
            </Text>
            <Pressable
              testID="nova-compra"
              onPress={() => setShowPurchase((v) => !v)}
              className={`mt-3 flex-row items-center justify-center gap-1 rounded-lg px-3 py-2 ${showPurchase ? 'border border-neutral-300 bg-white' : 'bg-brand-600'}`}
            >
              {showPurchase ? <X size={16} color="#0f172a" /> : <Plus size={16} color="white" />}
              <Text className={`text-sm font-medium ${showPurchase ? 'text-neutral-900' : 'text-white'}`}>
                {showPurchase ? 'Cancelar' : 'Nova compra'}
              </Text>
            </Pressable>
          </View>

          {showPurchase && (
            <PurchaseForm
              spaceId={currentSpaceId}
              cardId={selected.id}
              onCreated={async () => {
                setShowPurchase(false);
                await qc.invalidateQueries({ queryKey: ['invoices', currentSpaceId, selected.id] });
              }}
            />
          )}

          {payingInvoice && (
            <View className="border-b border-neutral-100 bg-neutral-50 p-4">
              <View className="flex-row items-center justify-between">
                <View className="flex-1">
                  <Text className="text-sm font-medium text-neutral-900">
                    Pagar fatura · {formatDate(payingInvoice.closingDate)}
                  </Text>
                  <Text className="text-xs text-neutral-500">
                    Em aberto {formatCurrency(payingInvoice.outstandingAmount)}
                  </Text>
                </View>
                <Pressable testID="pagar-fechar" onPress={closePay} className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5">
                  <X size={16} color="#0f172a" />
                </Pressable>
              </View>

              {payError && (
                <Text className="mt-3 rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-700">{payError}</Text>
              )}

              <Text className="mt-3 text-xs font-medium text-neutral-700">Conta de origem</Text>
              <View className="mt-1 space-y-1">
                {payAccounts.length === 0 && (
                  <Text className="text-xs text-neutral-500">Nenhuma conta disponivel.</Text>
                )}
                {payAccounts.map((a) => (
                  <Pressable
                    key={a.id}
                    testID={`pagar-conta-${a.name}`}
                    onPress={() => setPayAccount(a.id)}
                    className={`rounded-lg border px-3 py-2 ${payAccount === a.id ? 'border-brand-500 bg-brand-50' : 'border-neutral-200 bg-white'}`}
                  >
                    <Text className="text-sm text-neutral-900">{a.name}</Text>
                  </Pressable>
                ))}
              </View>

              <Text className="mt-3 text-xs font-medium text-neutral-700">Valor (opcional)</Text>
              <TextInput
                testID="pagar-valor"
                className="mt-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-neutral-900"
                placeholder={payingInvoice.outstandingAmount}
                placeholderTextColor="#94a3b8"
                keyboardType="decimal-pad"
                value={payAmount}
                onChangeText={setPayAmount}
              />

              <Pressable
                testID="pagar-confirmar"
                disabled={payBusy || !payAccount}
                onPress={() => submitPay(payingInvoice)}
                className={`mt-3 rounded-lg bg-brand-600 px-4 py-2.5 ${payBusy || !payAccount ? 'opacity-50' : ''}`}
              >
                <Text className="text-center text-sm font-medium text-white">
                  {payBusy ? 'Pagando...' : 'Confirmar pagamento'}
                </Text>
              </Pressable>
            </View>
          )}

          <View className="p-4 space-y-3">
            {invoicesQ.isLoading && <Text className="text-sm text-neutral-500">Carregando faturas...</Text>}
            {!invoicesQ.isLoading && invoices.length === 0 && (
              <Text className="text-sm text-neutral-500">
                Nenhuma fatura. As compras lancadas no cartao aparecem aqui.
              </Text>
            )}
            {invoices.map((inv) => (
              <View key={inv.id} testID={`fatura-${inv.closingDate}`} className="border-b border-neutral-100 pb-3">
                <View className="flex-row items-center justify-between">
                  <View className="flex-1 pr-3">
                    <Text className="font-medium text-neutral-900">Fechamento {formatDate(inv.closingDate)}</Text>
                    <Text className="text-xs text-neutral-500">
                      vence {formatDate(inv.dueDate)} · {invoiceLabel(inv.status)}
                    </Text>
                  </View>
                  <View className="items-end">
                    <Text className="font-semibold text-neutral-900">{formatCurrency(inv.totalAmount)}</Text>
                    <Text className="text-xs text-neutral-500">aberto {formatCurrency(inv.outstandingAmount)}</Text>
                  </View>
                </View>
                <View className="mt-2 flex-row items-center gap-2">
                  <Text className={`rounded-full px-2 py-0.5 text-xs font-medium ${BADGE[inv.status]}`}>
                    {invoiceLabel(inv.status)}
                  </Text>
                  {inv.status !== 'paid' && (
                    <Pressable
                      testID={`pagar-${inv.closingDate}`}
                      onPress={() => openPay(inv.closingDate)}
                      className="rounded-lg border border-neutral-300 bg-white px-3 py-1"
                    >
                      <Text className="text-xs font-medium text-neutral-900">Pagar</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

function CreateCardForm({ spaceId, onCreated }: { spaceId: string | null; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [limit, setLimit] = useState('1000.00');
  const [closingDay, setClosingDay] = useState('25');
  const [dueDay, setDueDay] = useState('5');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!spaceId || !name.trim()) return;
    setError(null);
    setBusy(true);
    try {
      await apiFetch(`/financial-spaces/${spaceId}/credit-cards`, {
        method: 'POST',
        json: {
          name: name.trim(),
          limit: limit.trim(),
          closingDay: Number(closingDay),
          dueDay: Number(dueDay),
        },
      });
      setName('');
      onCreated();
    } catch (e: any) {
      setError(e?.details?.message ?? e?.message ?? 'Nao foi possivel criar o cartao');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="mt-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <Text className="text-base font-semibold text-neutral-900">Novo cartao</Text>

      {error && (
        <Text className="mt-3 rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-700">{error}</Text>
      )}

      <Text className="mt-3 text-xs font-medium text-neutral-700">Nome</Text>
      <TextInput
        testID="cartao-nome"
        className="mt-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-neutral-900"
        placeholder="Ex.: Cartao Nubank"
        placeholderTextColor="#94a3b8"
        value={name}
        onChangeText={setName}
      />

      <Text className="mt-3 text-xs font-medium text-neutral-700">Limite</Text>
      <TextInput
        testID="cartao-limite"
        className="mt-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-neutral-900"
        keyboardType="decimal-pad"
        value={limit}
        onChangeText={setLimit}
      />

      <View className="mt-3 flex-row gap-3">
        <View className="flex-1">
          <Text className="text-xs font-medium text-neutral-700">Fechamento</Text>
          <TextInput
            testID="cartao-fechamento"
            className="mt-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-neutral-900"
            keyboardType="number-pad"
            value={closingDay}
            onChangeText={setClosingDay}
          />
        </View>
        <View className="flex-1">
          <Text className="text-xs font-medium text-neutral-700">Vencimento</Text>
          <TextInput
            testID="cartao-vencimento"
            className="mt-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-neutral-900"
            keyboardType="number-pad"
            value={dueDay}
            onChangeText={setDueDay}
          />
        </View>
      </View>

      <Pressable
        testID="cartao-salvar"
        disabled={busy || !name.trim()}
        onPress={submit}
        className={`mt-4 rounded-lg bg-brand-600 px-4 py-2.5 ${busy || !name.trim() ? 'opacity-50' : ''}`}
      >
        <Text className="text-center text-sm font-medium text-white">
          {busy ? 'Criando...' : 'Criar cartao'}
        </Text>
      </Pressable>
    </View>
  );
}

function PurchaseForm({
  spaceId,
  cardId,
  onCreated,
}: {
  spaceId: string | null;
  cardId: string;
  onCreated: () => void;
}) {
  const [description, setDescription] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [installments, setInstallments] = useState('1');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parcelas = Number(installments);
  const preview =
    totalAmount.trim() && parcelas >= 2 ? `~${formatCurrency(Number(totalAmount) / parcelas)} por mes` : null;

  async function submit() {
    if (!spaceId || !description.trim() || !totalAmount.trim()) return;
    setError(null);
    setBusy(true);
    try {
      const body: PurchaseInstallmentsRequest = {
        description: description.trim(),
        totalAmount: totalAmount.trim(),
        installments: parcelas,
        ...(purchaseDate.trim() ? { purchaseDate: purchaseDate.trim() } : {}),
      };
      await apiFetch(`/financial-spaces/${spaceId}/credit-cards/${cardId}/purchases`, {
        method: 'POST',
        json: body,
      });
      setDescription('');
      setTotalAmount('');
      setInstallments('1');
      setPurchaseDate('');
      onCreated();
    } catch (e: any) {
      setError(e?.details?.message ?? e?.message ?? 'Nao foi possivel lancar a compra');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="border-b border-neutral-100 bg-neutral-50 p-4">
      {error && (
        <Text className="mb-3 rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-700">{error}</Text>
      )}

      <Text className="text-xs font-medium text-neutral-700">Descricao</Text>
      <TextInput
        testID="compra-descricao"
        className="mt-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-neutral-900"
        placeholder="Ex.: Notebook Dell"
        placeholderTextColor="#94a3b8"
        value={description}
        onChangeText={setDescription}
      />

      <Text className="mt-3 text-xs font-medium text-neutral-700">Valor total</Text>
      <TextInput
        testID="compra-valor"
        className="mt-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-neutral-900"
        placeholder="Ex.: 3000.00"
        placeholderTextColor="#94a3b8"
        keyboardType="decimal-pad"
        value={totalAmount}
        onChangeText={setTotalAmount}
      />

      <View className="mt-3 flex-row gap-3">
        <View className="flex-1">
          <Text className="text-xs font-medium text-neutral-700">Parcelas</Text>
          <TextInput
            testID="compra-parcelas"
            className="mt-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-neutral-900"
            keyboardType="number-pad"
            value={installments}
            onChangeText={setInstallments}
          />
        </View>
        <View className="flex-1">
          <Text className="text-xs font-medium text-neutral-700">Data (opcional)</Text>
          <TextInput
            testID="compra-data"
            className="mt-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-neutral-900"
            placeholder="AAAA-MM-DD"
            placeholderTextColor="#94a3b8"
            value={purchaseDate}
            onChangeText={setPurchaseDate}
          />
        </View>
      </View>

      {preview && <Text className="mt-2 text-xs text-neutral-500">{preview}</Text>}

      <Pressable
        testID="compra-salvar"
        disabled={busy || !description.trim() || !totalAmount.trim()}
        onPress={submit}
        className={`mt-4 rounded-lg bg-brand-600 px-4 py-2.5 ${busy || !description.trim() || !totalAmount.trim() ? 'opacity-50' : ''}`}
      >
        <Text className="text-center text-sm font-medium text-white">
          {busy ? 'Lancando...' : 'Lancar compra'}
        </Text>
      </Pressable>
    </View>
  );
}

import { useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, RefreshControl } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../src/auth/AuthContext';
import { apiFetch } from '../../src/lib/api';
import type { CreateExchangeRateRequest, CurrencyCode, ExchangeRate } from '@scf/api-contracts';
import { Check, Coins, Pencil, Plus, Trash2, X } from 'lucide-react-native';

/** Moedas suportadas pelo dominio (mesmo conjunto do enum `CurrencyCode`). */
const CURRENCIES: CurrencyCode[] = ['BRL', 'USD', 'EUR', 'ARS', 'GBP', 'JPY'];

const today = () => new Date().toISOString().slice(0, 10);

export default function ExchangeRatesScreen() {
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
    <ScrollView
      className="flex-1 bg-neutral-50"
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={ratesQ.isFetching}
          onRefresh={() => ratesQ.refetch()}
          tintColor="#1e57f5"
        />
      }
    >
      <View className="flex-row items-start justify-between">
        <View className="flex-1">
          <Text className="text-2xl font-bold text-neutral-900">Taxas de cambio</Text>
          <Text className="text-sm text-neutral-500">
            Converta lancamentos de outras moedas para a moeda de reporte do espaco. A taxa vigente e a
            mais recente do par ate a data do lancamento.
          </Text>
        </View>
        <Pressable
          testID="taxa-nova"
          onPress={() => setShowCreate((v) => !v)}
          className="ml-3 flex-row items-center gap-1 rounded-lg bg-brand-600 px-3 py-2"
        >
          {showCreate ? <X size={16} color="white" /> : <Plus size={16} color="white" />}
          <Text className="text-sm font-medium text-white">{showCreate ? 'Cancelar' : 'Nova'}</Text>
        </Pressable>
      </View>

      {error && (
        <View className="mt-3 rounded-lg border border-danger-200 bg-danger-50 px-3 py-2">
          <Text className="text-sm text-danger-700">{error}</Text>
        </View>
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

      <View className="mt-4 rounded-xl border border-neutral-200 bg-white shadow-sm">
        <View className="border-b border-neutral-100 p-4">
          <Text className="text-base font-semibold text-neutral-900">Taxas cadastradas</Text>
          <Text className="mt-0.5 text-xs text-neutral-500">
            As taxas mais recentes substituem as anteriores do mesmo par
          </Text>
        </View>
        <View className="p-4">
          {ratesQ.isLoading && <Text className="text-sm text-neutral-500">Carregando...</Text>}
          {!ratesQ.isLoading && rates.length === 0 && (
            <View className="flex-row items-center gap-3">
              <Coins size={18} color="#94a3b8" />
              <Text className="flex-1 text-sm text-neutral-600">
                Nenhuma taxa cadastrada. Cadastre uma para somar lancamentos de outras moedas.
              </Text>
            </View>
          )}
          {rates.map((rate) => (
            <RateRow
              key={rate.id}
              rate={rate}
              spaceId={currentSpaceId}
              onChanged={refresh}
              onRemove={removeRate}
            />
          ))}
        </View>
      </View>
    </ScrollView>
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
    <View testID={`taxa-item-${rate.id}`} className="border-b border-neutral-100 py-4">
      <View className="flex-row items-center gap-2 font-medium text-neutral-900">
        <Text className="font-medium text-neutral-900">
          {rate.fromCurrency} {'->'} {rate.toCurrency}
        </Text>
      </View>
      {editing ? (
        <View className="mt-1 flex-row items-center gap-2">
          <Text className="text-xs text-neutral-500">1 {rate.fromCurrency} =</Text>
          <TextInput
            testID={`taxa-novo-valor-${rate.id}`}
            className="w-28 rounded-lg border border-neutral-300 bg-white px-2 py-1 text-neutral-900"
            keyboardType="decimal-pad"
            value={value}
            onChangeText={setValue}
          />
          <Text className="text-xs text-neutral-500">{rate.toCurrency}</Text>
        </View>
      ) : (
        <Text className="mt-1 text-xs text-neutral-500">
          1 {rate.fromCurrency} = {rate.rate} {rate.toCurrency} · vigente desde {rate.asOf}
          {rate.source ? ` · ${rate.source}` : ''}
        </Text>
      )}
      {error && <Text className="mt-1 text-xs text-danger-700">{error}</Text>}

      <View className="mt-3 flex-row items-center gap-2">
        {editing ? (
          <>
            <Pressable
              testID={`taxa-salvar-edicao-${rate.id}`}
              disabled={busy}
              onPress={save}
              className={`flex-row items-center gap-1 rounded-lg bg-brand-600 px-3 py-1 ${busy ? 'opacity-50' : ''}`}
            >
              <Check size={14} color="white" />
              <Text className="text-xs font-medium text-white">
                {busy ? 'Salvando...' : 'Salvar'}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setEditing(false)}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-1"
            >
              <Text className="text-xs font-medium text-neutral-900">Cancelar</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Pressable
              testID={`taxa-editar-${rate.id}`}
              onPress={() => {
                setValue(rate.rate);
                setEditing(true);
              }}
              className="flex-row items-center gap-1 rounded-lg border border-neutral-300 bg-white px-3 py-1"
            >
              <Pencil size={14} color="#0f172a" />
              <Text className="text-xs font-medium text-neutral-900">Editar</Text>
            </Pressable>
            <Pressable
              testID={`taxa-remover-${rate.id}`}
              onPress={() => onRemove(rate)}
              className="flex-row items-center gap-1 rounded-lg border border-neutral-300 bg-white px-3 py-1"
            >
              <Trash2 size={14} color="#0f172a" />
              <Text className="text-xs font-medium text-neutral-900">Remover</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
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

  async function submit() {
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
    <View className="mt-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <Text className="text-base font-semibold text-neutral-900">Nova taxa</Text>
      <Text className="mt-0.5 text-xs text-neutral-500">
        Informe quantas unidades da moeda de destino valem 1 unidade da moeda de origem.
      </Text>

      {error && (
        <Text className="mt-3 rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-700">{error}</Text>
      )}

      <Text className="mt-3 text-xs font-medium text-neutral-700">Moeda de origem</Text>
      <View className="mt-1 flex-row flex-wrap gap-2">
        {CURRENCIES.map((c) => (
          <Pressable
            key={c}
            testID={`taxa-de-${c}`}
            onPress={() => setFromCurrency(c)}
            className={`rounded-full border px-3 py-1 ${fromCurrency === c ? 'border-brand-500 bg-brand-50' : 'border-neutral-200 bg-white'}`}
          >
            <Text
              className={`text-xs font-medium ${fromCurrency === c ? 'text-brand-700' : 'text-neutral-700'}`}
            >
              {c}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text className="mt-3 text-xs font-medium text-neutral-700">Moeda de destino</Text>
      <View className="mt-1 flex-row flex-wrap gap-2">
        {CURRENCIES.map((c) => (
          <Pressable
            key={c}
            testID={`taxa-para-${c}`}
            onPress={() => setToCurrency(c)}
            className={`rounded-full border px-3 py-1 ${toCurrency === c ? 'border-brand-500 bg-brand-50' : 'border-neutral-200 bg-white'}`}
          >
            <Text
              className={`text-xs font-medium ${toCurrency === c ? 'text-brand-700' : 'text-neutral-700'}`}
            >
              {c}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text className="mt-3 text-xs font-medium text-neutral-700">Taxa</Text>
      <TextInput
        testID="taxa-valor"
        className="mt-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-neutral-900"
        keyboardType="decimal-pad"
        placeholder="Ex.: 5.2500"
        placeholderTextColor="#94a3b8"
        value={rate}
        onChangeText={setRate}
      />

      <Text className="mt-3 text-xs font-medium text-neutral-700">Vigente a partir de</Text>
      <TextInput
        testID="taxa-data"
        className="mt-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-neutral-900"
        placeholder="AAAA-MM-DD"
        placeholderTextColor="#94a3b8"
        value={asOf}
        onChangeText={setAsOf}
      />

      <Text className="mt-3 text-xs font-medium text-neutral-700">Fonte (opcional)</Text>
      <TextInput
        testID="taxa-fonte"
        className="mt-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-neutral-900"
        placeholder="Ex.: Banco Central"
        placeholderTextColor="#94a3b8"
        value={source}
        onChangeText={setSource}
      />

      {sameCurrency && (
        <Text className="mt-3 text-xs text-warning-700">
          As moedas de origem e destino devem ser diferentes.
        </Text>
      )}

      <Pressable
        testID="taxa-salvar"
        disabled={busy || sameCurrency}
        onPress={submit}
        className={`mt-4 flex-row items-center justify-center gap-1 rounded-lg bg-brand-600 px-4 py-2.5 ${busy || sameCurrency ? 'opacity-50' : ''}`}
      >
        <Check size={16} color="white" />
        <Text className="text-sm font-medium text-white">{busy ? 'Criando...' : 'Criar taxa'}</Text>
      </Pressable>
    </View>
  );
}

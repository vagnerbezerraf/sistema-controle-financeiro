import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../src/auth/AuthContext';
import { apiFetch } from '../../src/lib/api';
import type { Account, DashboardSummary } from '@scf/api-contracts';
import { ArrowDownRight, ArrowUpRight, TrendingUp, Wallet } from 'lucide-react-native';

function formatCurrency(n: string | number, _c = 'BRL') {
  void _c;
  const v = typeof n === 'string' ? Number(n) : n;
  return isFinite(v) ? `R$ ${v.toFixed(2).replace('.', ',')}` : '-';
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <View className={`rounded-xl border border-neutral-200 bg-white shadow-sm ${className}`}>{children}</View>;
}

function Stat({ title, value, icon: Icon, tone }: { title: string; value: string; icon: any; tone: 'brand' | 'success' | 'warning' | 'danger' }) {
  const bg = { brand: 'bg-brand-50 text-brand-700', success: 'bg-success-50 text-success-700', warning: 'bg-warning-50 text-warning-700', danger: 'bg-danger-50 text-danger-700' }[tone];
  return (
    <Card className="p-4 flex-1 mx-1">
      <View className="flex-row items-start justify-between">
        <View className="flex-1">
          <Text className="text-xs text-neutral-500">{title}</Text>
          <Text className="mt-2 text-xl font-bold text-neutral-900">{value}</Text>
        </View>
        <View className={`h-9 w-9 rounded-lg items-center justify-center ${bg}`}><Icon size={18} /></View>
      </View>
    </Card>
  );
}

export default function DashboardScreen() {
  const { currentSpaceId } = useAuth();
  const month = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; })();

  const summaryQ = useQuery({
    queryKey: ['summary', currentSpaceId, month],
    enabled: !!currentSpaceId,
    queryFn: () => apiFetch<DashboardSummary>(`/financial-spaces/${currentSpaceId}/transactions/summary/dashboard?month=${month}`),
  });
  const accountsQ = useQuery({
    queryKey: ['accounts', currentSpaceId],
    enabled: !!currentSpaceId,
    queryFn: () => apiFetch<Account[]>(`/financial-spaces/${currentSpaceId}/accounts`),
  });

  const s = summaryQ.data;

  return (
    <ScrollView
      className="flex-1 bg-neutral-50"
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      refreshControl={
        <RefreshControl
          refreshing={summaryQ.isFetching || accountsQ.isFetching}
          onRefresh={() => { summaryQ.refetch(); accountsQ.refetch(); }}
          tintColor="#1e57f5"
        />
      }
    >
      <Text className="text-2xl font-bold text-neutral-900">Ola</Text>
      <Text className="text-sm text-neutral-500">Resumo do mes atual.</Text>

      <View className="mt-5 flex-row -mx-1">
        <Stat title="Receitas" value={formatCurrency(s?.totalIncome ?? 0)} icon={ArrowUpRight} tone="success" />
        <Stat title="Despesas" value={formatCurrency(s?.totalExpense ?? 0)} icon={ArrowDownRight} tone="danger" />
      </View>
      <View className="mt-3 flex-row -mx-1">
        <Stat title="Realizado" value={formatCurrency(s?.realizedBalance ?? 0)} icon={Wallet} tone="brand" />
        <Stat title="Projetado" value={formatCurrency(s?.projectedBalance ?? 0)} icon={TrendingUp} tone="warning" />
      </View>

      <Card className="mt-6">
        <View className="p-5 border-b border-neutral-100">
          <Text className="text-base font-semibold text-neutral-900">Contas</Text>
          <Text className="text-xs text-neutral-500 mt-0.5">Saldos cadastrados.</Text>
        </View>
        <View className="p-4 space-y-3">
          {(accountsQ.data ?? []).map((a) => (
            <View key={a.id} className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-3">
                <View className="h-3 w-3 rounded-full" style={{ backgroundColor: a.color ?? '#cbd5e1' }} />
                <View>
                  <Text className="font-medium text-neutral-900">{a.name}</Text>
                  <Text className="text-xs text-neutral-500">{a.type}</Text>
                </View>
              </View>
              <Text className="font-semibold text-neutral-900">{formatCurrency(a.initialBalance)}</Text>
            </View>
          ))}
          {(accountsQ.data ?? []).length === 0 && (
            <Text className="text-sm text-neutral-500 text-center py-4">Sem contas ainda.</Text>
          )}
        </View>
      </Card>
    </ScrollView>
  );
}

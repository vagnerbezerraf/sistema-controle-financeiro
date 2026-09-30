import { View, Text, FlatList } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../src/auth/AuthContext';
import { apiFetch } from '../../src/lib/api';
import type { Transaction } from '@scf/api-contracts';
import { Calendar } from 'lucide-react-native';

function formatCurrency(n: string | number) {
  const v = typeof n === 'string' ? Number(n) : n;
  return `R$ ${v.toFixed(2).replace('.', ',')}`;
}

export default function TransactionsScreen() {
  const { currentSpaceId } = useAuth();
  const q = useQuery({
    queryKey: ['tx', currentSpaceId],
    enabled: !!currentSpaceId,
    queryFn: () => apiFetch<{ items: Transaction[] }>(`/financial-spaces/${currentSpaceId}/transactions?limit=50`),
  });
  const items = q.data?.items ?? [];

  return (
    <FlatList
      data={items}
      className="flex-1 bg-neutral-50"
      contentContainerStyle={{ padding: 16 }}
      ListHeaderComponent={
        <View className="mb-4">
          <Text className="text-2xl font-bold text-neutral-900">Lancamentos</Text>
          <Text className="text-sm text-neutral-500">Registro rapido de movimentacoes.</Text>
        </View>
      }
      renderItem={({ item: t }) => (
        <View className="flex-row items-center justify-between py-3 border-b border-neutral-100">
          <View className="flex-1 pr-4">
            <Text numberOfLines={1} className="font-medium text-neutral-900">{t.description}</Text>
            <View className="mt-1 flex-row items-center gap-2">
              <Calendar size={12} color="#64748b" />
              <Text className="text-xs text-neutral-500">{t.effectiveDate}</Text>
              <Text className="text-xs uppercase text-neutral-500">{t.type}</Text>
              <Text className="text-xs uppercase text-neutral-500">{t.status}</Text>
            </View>
          </View>
          <Text className={`text-sm font-semibold ${t.type === 'income' ? 'text-success-700' : t.type === 'expense' ? 'text-danger-700' : 'text-neutral-900'}`}>
            {t.type === 'income' ? '+' : t.type === 'expense' ? '-' : ''} {formatCurrency(t.totalAmount)}
          </Text>
        </View>
      )}
      ListEmptyComponent={
        <Text className="text-center text-sm text-neutral-500 py-8">Sem lancamentos.</Text>
      }
    />
  );
}

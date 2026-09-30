import { View, Text, ScrollView } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../src/auth/AuthContext';
import { apiFetch } from '../../src/lib/api';
import type { Account } from '@scf/api-contracts';

function formatCurrency(n: string | number) {
  const v = typeof n === 'string' ? Number(n) : n;
  return `R$ ${v.toFixed(2).replace('.', ',')}`;
}

export default function AccountsScreen() {
  const { currentSpaceId } = useAuth();
  const q = useQuery({
    queryKey: ['accounts', currentSpaceId],
    enabled: !!currentSpaceId,
    queryFn: () => apiFetch<Account[]>(`/financial-spaces/${currentSpaceId}/accounts`),
  });
  const items = q.data ?? [];
  return (
    <ScrollView className="flex-1 bg-neutral-50" contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Text className="text-2xl font-bold text-neutral-900">Contas</Text>
      <Text className="text-sm text-neutral-500">Contas correntes, poupanca, carteiras.</Text>

      <View className="mt-5 space-y-3">
        {items.map((a) => (
          <View key={a.id} className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-3">
                <View className="h-3 w-3 rounded-full" style={{ backgroundColor: a.color ?? '#cbd5e1' }} />
                <Text className="font-semibold text-neutral-900">{a.name}</Text>
              </View>
              <Text className="text-xs uppercase text-neutral-500">{a.type}</Text>
            </View>
            <Text className="mt-4 text-2xl font-bold">{formatCurrency(a.initialBalance)}</Text>
            <Text className="mt-1 text-xs text-neutral-500">{a.currency} · Saldo em {a.initialBalanceDate}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

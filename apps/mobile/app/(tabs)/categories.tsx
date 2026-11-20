import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../src/auth/AuthContext';
import { apiFetch } from '../../src/lib/api';
import type { Category } from '@scf/api-contracts';
import { Tags } from 'lucide-react-native';

export default function CategoriesScreen() {
  const { currentSpaceId } = useAuth();

  const categoriesQ = useQuery({
    queryKey: ['categories', currentSpaceId],
    enabled: !!currentSpaceId,
    queryFn: () => apiFetch<Category[]>(`/financial-spaces/${currentSpaceId}/categories`),
  });
  const list = categoriesQ.data ?? [];

  const income = list.filter((c) => c.type === 'income' || c.type === 'both');
  const expense = list.filter((c) => c.type === 'expense' || c.type === 'both');

  return (
    <ScrollView
      className="flex-1 bg-neutral-50"
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      refreshControl={
        <RefreshControl
          refreshing={categoriesQ.isFetching}
          onRefresh={() => categoriesQ.refetch()}
          tintColor="#1e57f5"
        />
      }
    >
      <Text className="text-2xl font-bold text-neutral-900">Categorias</Text>
      <Text className="text-sm text-neutral-500">
        Classifique seus lancamentos em receitas, despesas e ambos.
      </Text>

      <CategorySection
        title="Receitas"
        subtitle="Fontes de renda e entradas"
        list={income}
        tone="success"
        testID="categorias-receitas"
      />
      <CategorySection
        title="Despesas"
        subtitle="Gastos e saidas"
        list={expense}
        tone="danger"
        testID="categorias-despesas"
      />
    </ScrollView>
  );
}

function CategorySection({
  title,
  subtitle,
  list,
  tone,
  testID,
}: {
  title: string;
  subtitle: string;
  list: Category[];
  tone: 'success' | 'danger';
  testID: string;
}) {
  return (
    <View testID={testID} className="mt-5 rounded-xl border border-neutral-200 bg-white shadow-sm">
      <View className="flex-row items-center gap-2 border-b border-neutral-100 p-4">
        <View
          className={`rounded-md p-2 ${tone === 'success' ? 'bg-success-50' : 'bg-danger-50'}`}
        >
          <Tags size={16} color={tone === 'success' ? '#15803d' : '#b91c1c'} />
        </View>
        <View className="flex-1">
          <Text className="text-base font-semibold text-neutral-900">{title}</Text>
          <Text className="text-xs text-neutral-500">{subtitle}</Text>
        </View>
      </View>
      <View className="p-4">
        {list.length === 0 ? (
          <Text className="text-sm text-neutral-500">Nenhuma categoria nesta secao.</Text>
        ) : (
          list.map((c) => (
            <View
              key={c.id}
              testID={`categoria-${c.id}`}
              className="flex-row items-center justify-between gap-3 border-b border-neutral-100 py-3"
            >
              <View className="flex-1 flex-row items-center gap-3">
                <View
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: c.color ?? '#cbd5e1' }}
                />
                <Text className="font-medium text-neutral-900" numberOfLines={1}>
                  {c.name}
                </Text>
                {c.type === 'both' && (
                  <Text className="rounded border border-neutral-200 bg-neutral-50 px-1.5 py-0.5 text-xs text-neutral-700">
                    Ambos
                  </Text>
                )}
              </View>
              <Text className="text-xs text-neutral-500">{c.icon ?? '-'}</Text>
            </View>
          ))
        )}
      </View>
    </View>
  );
}

import { Tabs } from 'expo-router';
import { LayoutDashboard, ArrowLeftRight, CalendarClock, Wallet, Plus, User, CreditCard, Tags, PiggyBank, Target, Filter, Coins, FileText } from 'lucide-react-native';
import { Pressable, View, StyleSheet } from 'react-native';

function NewButton({ onPress }: { onPress: () => void }) {
  return (
    <View style={styles.plusWrap}>
      <Pressable android_ripple={{ color: '#ffffff20' }} style={styles.plusBtn} onPress={onPress}>
        <Plus size={24} color="white" />
      </Pressable>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        tabBarStyle: { height: 62, borderTopWidth: 1, borderTopColor: '#e2e8f0', backgroundColor: '#ffffff' },
        tabBarActiveTintColor: '#1e57f5',
        tabBarInactiveTintColor: '#64748b',
        tabBarLabelStyle: { fontSize: 12, paddingBottom: 6 },
      }}
    >
      <Tabs.Screen name="dashboard" options={{
        title: 'Dashboard',
        tabBarButtonTestID: 'tab-dashboard',
        tabBarIcon: ({ color }) => <LayoutDashboard size={22} color={color} />,
      }} />
      <Tabs.Screen name="transactions" options={{
        title: 'Lancamentos',
        tabBarButtonTestID: 'tab-lancamentos',
        tabBarIcon: ({ color }) => <ArrowLeftRight size={22} color={color} />,
        headerRight: () => <NewButton onPress={() => {}} />,
      }} />
      <Tabs.Screen name="accounts" options={{
        title: 'Contas',
        tabBarButtonTestID: 'tab-contas',
        tabBarIcon: ({ color }) => <Wallet size={22} color={color} />,
      }} />
      <Tabs.Screen name="cards" options={{
        title: 'Cartoes',
        tabBarButtonTestID: 'tab-cartoes',
        tabBarIcon: ({ color }) => <CreditCard size={22} color={color} />,
      }} />
      <Tabs.Screen name="obligations" options={{
        title: 'A pagar',
        tabBarButtonTestID: 'tab-obrigacoes',
        tabBarIcon: ({ color }) => <CalendarClock size={22} color={color} />,
      }} />
      <Tabs.Screen name="categories" options={{
        title: 'Categorias',
        tabBarButtonTestID: 'tab-categorias',
        tabBarIcon: ({ color }) => <Tags size={22} color={color} />,
      }} />
      <Tabs.Screen name="budgets" options={{
        title: 'Orcamentos',
        tabBarButtonTestID: 'tab-orcamentos',
        tabBarIcon: ({ color }) => <PiggyBank size={22} color={color} />,
      }} />
      <Tabs.Screen name="categorization-rules" options={{
        title: 'Regras',
        tabBarButtonTestID: 'tab-regras',
        tabBarIcon: ({ color }) => <Filter size={22} color={color} />,
      }} />
      <Tabs.Screen name="exchange-rates" options={{
        title: 'Cambio',
        tabBarButtonTestID: 'tab-cambio',
        tabBarIcon: ({ color }) => <Coins size={22} color={color} />,
      }} />
      <Tabs.Screen name="report-jobs" options={{
        title: 'Relatorios',
        tabBarButtonTestID: 'tab-relatorios',
        tabBarIcon: ({ color }) => <FileText size={22} color={color} />,
      }} />
      <Tabs.Screen name="goals" options={{
        title: 'Metas',
        tabBarButtonTestID: 'tab-metas',
        tabBarIcon: ({ color }) => <Target size={22} color={color} />,
      }} />
      <Tabs.Screen name="profile" options={{
        title: 'Perfil',
        tabBarButtonTestID: 'tab-perfil',
        tabBarIcon: ({ color }) => <User size={22} color={color} />,
      }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  plusWrap: { marginRight: 12 },
  plusBtn: {
    backgroundColor: '#1e57f5',
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/auth/AuthContext';
import { LogOut, Settings, UserCircle } from 'lucide-react-native';

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const router = useRouter();
  return (
    <View className="flex-1 bg-neutral-50 p-6">
      <Text className="text-2xl font-bold text-neutral-900">Perfil</Text>
      <Text className="text-sm text-neutral-500">Preferencias e sair da conta.</Text>

      <View className="mt-6 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
        <View className="flex-row items-center gap-4">
          <View className="h-12 w-12 rounded-full bg-brand-50 items-center justify-center">
            <UserCircle size={28} color="#1e57f5" />
          </View>
          <View className="flex-1">
            <Text className="font-semibold text-neutral-900">{user?.name ?? user?.email}</Text>
            <Text className="text-xs text-neutral-500">{user?.email}</Text>
          </View>
        </View>
      </View>

      <View className="mt-4 rounded-xl border border-neutral-200 bg-white overflow-hidden">
        <Pressable android_ripple={{ color: '#e2e8f0' }} className="flex-row items-center gap-3 p-4 border-b border-neutral-100">
          <Settings size={18} color="#475569" />
          <Text className="text-neutral-800">Configuracoes</Text>
        </Pressable>
        <Pressable
          android_ripple={{ color: '#fee2e2' }}
          className="flex-row items-center gap-3 p-4"
          onPress={async () => { await logout(); router.replace('/(public)/login'); }}
        >
          <LogOut size={18} color="#dc2626" />
          <Text className="text-danger-700 font-medium">Sair da conta</Text>
        </Pressable>
      </View>

      <Text className="mt-10 text-center text-xs text-neutral-500">SCF Mobile v0.1.0</Text>
    </View>
  );
}

import { Redirect } from 'expo-router';
import { View, Text, ActivityIndicator } from 'react-native';
import { useAuth } from '../src/auth/AuthContext';

export default function Index() {
  const { loading, loggedIn } = useAuth();
  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-neutral-50">
        <ActivityIndicator size="large" color="#1e57f5" />
        <Text className="mt-4 text-sm text-neutral-500">Carregando SCF...</Text>
      </View>
    );
  }
  return loggedIn ? <Redirect href="/(tabs)/dashboard" /> : <Redirect href="/(public)/login" />;
}

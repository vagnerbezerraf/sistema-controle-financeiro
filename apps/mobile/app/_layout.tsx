import '../global.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '../src/auth/AuthContext';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: (fc: number, e: any) => (e?.status === 401 ? false : fc < 2) },
  },
});

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(public)/login" />
            <Stack.Screen name="(tabs)" />
          </Stack>
          <StatusBar style="dark" />
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

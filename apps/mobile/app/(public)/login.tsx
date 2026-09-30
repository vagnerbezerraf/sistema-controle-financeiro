import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ShieldCheck, Sparkles } from 'lucide-react-native';
import { useAuth } from '../../src/auth/AuthContext';

const schema = z.object({
  email: z.string().email('Informe um e-mail valido'),
  password: z.string().min(8, 'Senha deve ter pelo menos 8 caracteres'),
  name: z.string().optional(),
});

export default function LoginScreen() {
  const router = useRouter();
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { control, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '', name: '' },
  });

  const submit = handleSubmit(async (data) => {
    setError(null);
    setLoading(true);
    try {
      if (mode === 'login') await login(data.email, data.password);
      else await register({ email: data.email, password: data.password, name: data.name, timezone: 'America/Sao_Paulo' });
      router.replace('/(tabs)/dashboard');
    } catch (e: any) {
      setError(e?.details?.message ?? e?.message ?? 'Falha na autenticacao');
    } finally {
      setLoading(false);
    }
  });

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="bg-neutral-50">
        <View className="px-6 pt-16 pb-6 items-center">
          <View className="h-20 w-20 rounded-3xl bg-brand-600 items-center justify-center shadow-md shadow-brand-900/20">
            <ShieldCheck size={40} color="white" />
          </View>
          <Text className="mt-4 text-2xl font-bold text-neutral-900">SCF</Text>
          <Text className="mt-1 text-sm text-neutral-500 text-center max-w-xs">
            Controle financeiro pessoal e familiar com clareza.
          </Text>
        </View>

        <View className="px-6 pb-10">
          <View className="flex-row bg-neutral-100 rounded-md p-1 mb-6">
            <TouchableOpacity
              onPress={() => setMode('login')}
              className={`flex-1 py-2 rounded ${mode === 'login' ? 'bg-white shadow-sm' : ''}`}
            >
              <Text className={`text-center text-sm font-medium ${mode === 'login' ? 'text-neutral-900' : 'text-neutral-600'}`}>Entrar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setMode('register')}
              className={`flex-1 py-2 rounded ${mode === 'register' ? 'bg-white shadow-sm' : ''}`}
            >
              <Text className={`text-center text-sm font-medium ${mode === 'register' ? 'text-neutral-900' : 'text-neutral-600'}`}>Criar conta</Text>
            </TouchableOpacity>
          </View>

          {mode === 'register' && (
            <View className="mb-4">
              <Text className="label">Nome (opcional)</Text>
              <Controller
                control={control}
                name="name"
                render={({ field: { onBlur, onChange, value } }) => (
                  <TextInput
                    className="input mt-1"
                    placeholder="Seu nome"
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                    autoCapitalize="words"
                  />
                )}
              />
              {errors.name && <Text className="mt-1 text-xs text-danger-600">{errors.name.message as string}</Text>}
            </View>
          )}

          <View className="mb-4">
            <Text className="label">E-mail</Text>
            <Controller
              control={control}
              name="email"
              render={({ field: { onBlur, onChange, value } }) => (
                <TextInput
                  className="input mt-1"
                  placeholder="voce@exemplo.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                />
              )}
            />
            {errors.email && <Text className="mt-1 text-xs text-danger-600">{errors.email.message as string}</Text>}
          </View>

          <View className="mb-4">
            <Text className="label">Senha</Text>
            <Controller
              control={control}
              name="password"
              render={({ field: { onBlur, onChange, value } }) => (
                <TextInput
                  className="input mt-1"
                  placeholder="Minimo 8 caracteres"
                  secureTextEntry
                  autoComplete="password"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                />
              )}
            />
            {errors.password && <Text className="mt-1 text-xs text-danger-600">{errors.password.message as string}</Text>}
          </View>

          {error && (
            <View className="mb-4 rounded-md border border-danger-200 bg-danger-50 px-3 py-2">
              <Text className="text-sm text-danger-700">{error}</Text>
            </View>
          )}

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={submit}
            disabled={loading}
            className={`h-12 rounded-md items-center justify-center bg-brand-600 ${loading ? 'opacity-60' : ''}`}
          >
            <Text className="font-semibold text-white">{loading ? 'Aguarde...' : mode === 'login' ? 'Entrar' : 'Criar conta'}</Text>
          </TouchableOpacity>

          <View className="mt-8 flex-row items-center gap-2 text-xs text-neutral-500">
            <Sparkles size={14} color="#64748b" />
            <Text className="flex-1">Registros rapidos, saldos realizados e projetados sempre separados.</Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

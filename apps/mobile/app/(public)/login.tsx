import { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ShieldCheck, Sparkles } from 'lucide-react-native';
import { useAuth } from '../../src/auth/AuthContext';
import { fetchOidcConfig, loginWithOidc } from '../../src/lib/oidc';

const schema = z.object({
  email: z.string().email('Informe um e-mail valido'),
  password: z.string().min(8, 'Senha deve ter pelo menos 8 caracteres'),
  name: z.string().optional(),
  mfaCode: z.string().optional(),
});

export default function LoginScreen() {
  const router = useRouter();
  const { login, register, applySession } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [ssoEnabled, setSsoEnabled] = useState(false);

  const { control, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '', name: '', mfaCode: '' },
  });

  useEffect(() => {
    fetchOidcConfig('mobile')
      .then((cfg) => setSsoEnabled(cfg.enabled))
      .catch(() => setSsoEnabled(false));
  }, []);

  const submit = handleSubmit(async (data) => {
    setError(null);
    setLoading(true);
    try {
      if (mode === 'login') {
        const res = await login(data.email, data.password, data.mfaCode || undefined);
        if (res.mfaRequired) {
          setMfaRequired(true);
          return;
        }
      } else {
        await register({ email: data.email, password: data.password, name: data.name, timezone: 'America/Sao_Paulo' });
      }
      router.replace('/(tabs)/dashboard');
    } catch (e: any) {
      setError(e?.details?.message ?? e?.message ?? 'Falha na autenticacao');
    } finally {
      setLoading(false);
    }
  });

  async function onSso() {
    setError(null);
    setLoading(true);
    try {
      const res = await loginWithOidc();
      await applySession(res);
      router.replace('/(tabs)/dashboard');
    } catch (e: any) {
      setError(e?.details?.message ?? e?.message ?? 'Nao foi possivel entrar com SSO');
    } finally {
      setLoading(false);
    }
  }

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
              testID="toggle-login"
              onPress={() => { setMode('login'); setMfaRequired(false); }}
              className={`flex-1 py-2 rounded ${mode === 'login' ? 'bg-white shadow-sm' : ''}`}
            >
              <Text className={`text-center text-sm font-medium ${mode === 'login' ? 'text-neutral-900' : 'text-neutral-600'}`}>Entrar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="toggle-register"
              onPress={() => { setMode('register'); setMfaRequired(false); }}
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
                    testID="input-nome"
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
                  testID="input-email"
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
                  testID="input-senha"
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

          {mfaRequired && (
            <View className="mb-4">
              <Text className="label">Codigo de verificacao (MFA)</Text>
              <Controller
                control={control}
                name="mfaCode"
                render={({ field: { onBlur, onChange, value } }) => (
                  <TextInput
                    className="input mt-1"
                    placeholder="123456 ou codigo de recuperacao"
                    keyboardType="number-pad"
                    autoComplete="one-time-code"
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                  />
                )}
              />
              <Text className="mt-1 text-xs text-neutral-500">
                Abra seu app autenticador ou use um codigo de recuperacao.
              </Text>
            </View>
          )}

          {error && (
            <View className="mb-4 rounded-md border border-danger-200 bg-danger-50 px-3 py-2">
              <Text className="text-sm text-danger-700">{error}</Text>
            </View>
          )}

          <TouchableOpacity
            testID="btn-submit"
            activeOpacity={0.8}
            onPress={submit}
            disabled={loading}
            className={`h-12 rounded-md items-center justify-center bg-brand-600 ${loading ? 'opacity-60' : ''}`}
          >
            <Text className="font-semibold text-white">
              {loading ? 'Aguarde...' : mode === 'login' ? (mfaRequired ? 'Confirmar codigo' : 'Entrar') : 'Criar conta'}
            </Text>
          </TouchableOpacity>

          {mode === 'login' && (
            <TouchableOpacity className="mt-4 items-center" onPress={() => router.push('/forgot-password')}>
              <Text className="text-sm text-brand-700">Esqueci minha senha</Text>
            </TouchableOpacity>
          )}

          {mode === 'login' && ssoEnabled && (
            <>
              <View className="my-6 flex-row items-center gap-3">
                <View className="h-px flex-1 bg-neutral-200" />
                <Text className="text-xs text-neutral-400">ou</Text>
                <View className="h-px flex-1 bg-neutral-200" />
              </View>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={onSso}
                disabled={loading}
                className={`h-12 rounded-md items-center justify-center border border-neutral-300 bg-white ${loading ? 'opacity-60' : ''}`}
              >
                <Text className="font-semibold text-neutral-800">Entrar com SSO (OIDC)</Text>
              </TouchableOpacity>
            </>
          )}

          <View className="mt-8 flex-row items-center gap-2 text-xs text-neutral-500">
            <Sparkles size={14} color="#64748b" />
            <Text className="flex-1">Registros rapidos, saldos realizados e projetados sempre separados.</Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiFetch } from '../../src/lib/api';

const schema = z.object({
  email: z.string().email('Informe um e-mail valido'),
});

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { control, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
  });

  const submit = handleSubmit(async (data) => {
    setError(null);
    setLoading(true);
    try {
      await apiFetch('/identity/password/forgot', {
        method: 'POST',
        json: { email: data.email },
        publicEndpoint: true,
      });
      setSent(true);
    } catch (e: any) {
      setError(e?.details?.message ?? e?.message ?? 'Nao foi possivel solicitar a redefinicao');
    } finally {
      setLoading(false);
    }
  });

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="bg-neutral-50">
        <View className="px-6 pt-16 pb-6">
          <Text className="text-2xl font-bold text-neutral-900">Recuperar senha</Text>
          <Text className="mt-1 text-sm text-neutral-500">
            Informe seu e-mail e enviaremos um link para redefinir sua senha.
          </Text>
        </View>

        <View className="px-6 pb-10">
          {sent ? (
            <View className="space-y-4">
              <View className="rounded-md border border-success-200 bg-success-50 px-3 py-2">
                <Text className="text-sm text-success-700">
                  Se houver uma conta com esse e-mail, enviamos as instrucoes de redefinicao.
                </Text>
              </View>
              <Text className="mt-3 text-sm text-neutral-600">
                Verifique sua caixa de entrada e a pasta de spam. O link expira em 60 minutos.
              </Text>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => router.replace('/login')}
                className="mt-6 h-12 rounded-md items-center justify-center border border-neutral-300 bg-white"
              >
                <Text className="font-semibold text-neutral-800">Voltar para o login</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
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
                <Text className="font-semibold text-white">{loading ? 'Enviando...' : 'Enviar link de redefinicao'}</Text>
              </TouchableOpacity>

              <TouchableOpacity className="mt-6 items-center" onPress={() => router.replace('/login')}>
                <Text className="text-sm text-brand-700">Voltar para o login</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiFetch } from '../../src/lib/api';

const schema = z
  .object({
    password: z.string().min(8, 'Senha deve ter pelo menos 8 caracteres'),
    password2: z.string().min(8, 'Confirme a senha'),
  })
  .refine((d) => d.password === d.password2, {
    message: 'Senhas nao coincidem',
    path: ['password2'],
  });

export default function ResetPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string }>();
  const token = typeof params.token === 'string' ? params.token : '';
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { control, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { password: '', password2: '' },
  });

  const submit = handleSubmit(async (data) => {
    setError(null);
    setLoading(true);
    try {
      await apiFetch('/identity/password/reset', {
        method: 'POST',
        json: { token, password: data.password },
        publicEndpoint: true,
      });
      setDone(true);
    } catch (e: any) {
      setError(e?.details?.message ?? e?.message ?? 'Nao foi possivel redefinir a senha');
    } finally {
      setLoading(false);
    }
  });

  if (!token) {
    return (
      <View className="flex-1 items-center justify-center bg-neutral-50 px-6">
        <Text className="text-xl font-bold text-neutral-900">Link invalido</Text>
        <Text className="mt-2 text-center text-sm text-neutral-500">
          Este link de redefinicao esta incompleto ou expirou. Solicite um novo.
        </Text>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => router.replace('/forgot-password')}
          className="mt-6 h-12 w-full rounded-md items-center justify-center bg-brand-600"
        >
          <Text className="font-semibold text-white">Solicitar novo link</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="bg-neutral-50">
        <View className="px-6 pt-16 pb-6">
          <Text className="text-2xl font-bold text-neutral-900">Definir nova senha</Text>
          <Text className="mt-1 text-sm text-neutral-500">Escolha uma senha forte para sua conta.</Text>
        </View>

        <View className="px-6 pb-10">
          {done ? (
            <>
              <View className="rounded-md border border-success-200 bg-success-50 px-3 py-2">
                <Text className="text-sm text-success-700">Senha redefinida com sucesso.</Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => router.replace('/login')}
                className="mt-6 h-12 rounded-md items-center justify-center bg-brand-600"
              >
                <Text className="font-semibold text-white">Ir para o login</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View className="mb-4">
                <Text className="label">Nova senha</Text>
                <Controller
                  control={control}
                  name="password"
                  render={({ field: { onBlur, onChange, value } }) => (
                    <TextInput
                      className="input mt-1"
                      placeholder="Minimo 8 caracteres"
                      secureTextEntry
                      autoComplete="password-new"
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value}
                    />
                  )}
                />
                {errors.password && <Text className="mt-1 text-xs text-danger-600">{errors.password.message as string}</Text>}
              </View>

              <View className="mb-4">
                <Text className="label">Confirmar nova senha</Text>
                <Controller
                  control={control}
                  name="password2"
                  render={({ field: { onBlur, onChange, value } }) => (
                    <TextInput
                      className="input mt-1"
                      placeholder="Repita a senha"
                      secureTextEntry
                      autoComplete="password-new"
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value}
                    />
                  )}
                />
                {errors.password2 && <Text className="mt-1 text-xs text-danger-600">{errors.password2.message as string}</Text>}
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
                <Text className="font-semibold text-white">{loading ? 'Salvando...' : 'Redefinir senha'}</Text>
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

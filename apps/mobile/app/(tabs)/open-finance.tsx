import { useState } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../src/auth/AuthContext';
import { apiFetch } from '../../src/lib/api';
import type {
  CreateOpenFinanceConsentRequest,
  OpenFinanceConsent,
  OpenFinanceConsentStatus,
  OpenFinanceInstitution,
} from '@scf/api-contracts';
import { Link2, RefreshCw, ShieldCheck, Unplug } from 'lucide-react-native';

/** Rotulos e cores por situacao do consentimento. */
const STATUS_LABELS: Record<OpenFinanceConsentStatus, string> = {
  pending: 'Autorizacao pendente',
  authorized: 'Conectado',
  rejected: 'Recusado',
  expired: 'Expirado',
  revoked: 'Revogado',
};

const STATUS_CLASSES: Record<OpenFinanceConsentStatus, string> = {
  pending: 'bg-warning-50',
  authorized: 'bg-success-50',
  rejected: 'bg-danger-50',
  expired: 'bg-neutral-100',
  revoked: 'bg-neutral-100',
};

const STATUS_TEXT_CLASSES: Record<OpenFinanceConsentStatus, string> = {
  pending: 'text-warning-700',
  authorized: 'text-success-700',
  rejected: 'text-danger-700',
  expired: 'text-neutral-600',
  revoked: 'text-neutral-600',
};

export default function OpenFinanceScreen() {
  const { currentSpaceId } = useAuth();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const institutionsQ = useQuery({
    queryKey: ['open-finance.institutions', currentSpaceId],
    enabled: !!currentSpaceId,
    queryFn: () =>
      apiFetch<OpenFinanceInstitution[]>(`/financial-spaces/${currentSpaceId}/open-finance/institutions`),
  });

  const institutions = institutionsQ.data ?? [];

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ['open-finance.institutions', currentSpaceId] });
  }

  async function run(institution: OpenFinanceInstitution, action: () => Promise<unknown>) {
    setError(null);
    setBusyId(institution.id);
    try {
      await action();
      await refresh();
    } catch (e: any) {
      setError(e?.details?.message ?? e?.message ?? 'Nao foi possivel concluir a operacao');
    } finally {
      setBusyId(null);
    }
  }

  function connect(institution: OpenFinanceInstitution) {
    if (!currentSpaceId) return;
    return run(institution, () => {
      const body: CreateOpenFinanceConsentRequest = { institutionId: institution.id };
      return apiFetch(`/financial-spaces/${currentSpaceId}/open-finance/consents`, {
        method: 'POST',
        json: body,
      });
    });
  }

  function check(institution: OpenFinanceInstitution) {
    if (!currentSpaceId || !institution.consent) return;
    return run(institution, () =>
      apiFetch(
        `/financial-spaces/${currentSpaceId}/open-finance/consents/${institution.consent!.id}/refresh`,
        { method: 'POST' },
      ),
    );
  }

  function revoke(institution: OpenFinanceInstitution) {
    if (!currentSpaceId || !institution.consent) return;
    return run(institution, () =>
      apiFetch(
        `/financial-spaces/${currentSpaceId}/open-finance/consents/${institution.consent!.id}`,
        { method: 'DELETE' },
      ),
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-neutral-50"
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={institutionsQ.isFetching}
          onRefresh={() => institutionsQ.refetch()}
          tintColor="#1e57f5"
        />
      }
    >
      <Text className="text-2xl font-bold text-neutral-900">Open Finance</Text>
      <Text className="text-sm text-neutral-500">
        Conecte instituicoes via Open Finance. A autorizacao acontece no ambiente do provedor; aqui
        voce acompanha, reconsulta e revoga cada consentimento do espaco.
      </Text>

      {error && (
        <View className="mt-3 rounded-lg border border-danger-200 bg-danger-50 px-3 py-2">
          <Text className="text-sm text-danger-700">{error}</Text>
        </View>
      )}

      <View className="mt-4 rounded-xl border border-neutral-200 bg-white shadow-sm">
        <View className="border-b border-neutral-100 p-4">
          <Text className="text-base font-semibold text-neutral-900">Instituicoes</Text>
          <Text className="mt-0.5 text-xs text-neutral-500">
            Cada instituicao aceita um consentimento por espaco
          </Text>
        </View>
        <View className="p-4">
          {institutionsQ.isLoading && <Text className="text-sm text-neutral-500">Carregando...</Text>}
          {!institutionsQ.isLoading && institutions.length === 0 && (
            <View className="flex-row items-center gap-3">
              <Link2 size={18} color="#94a3b8" />
              <Text className="flex-1 text-sm text-neutral-600">
                Nenhuma instituicao disponivel no provedor.
              </Text>
            </View>
          )}
          {institutions.map((institution) => (
            <InstitutionRow
              key={institution.id}
              institution={institution}
              busy={busyId === institution.id}
              onConnect={() => connect(institution)}
              onCheck={() => check(institution)}
              onRevoke={() => revoke(institution)}
            />
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

function InstitutionRow({
  institution,
  busy,
  onConnect,
  onCheck,
  onRevoke,
}: {
  institution: OpenFinanceInstitution;
  busy: boolean;
  onConnect: () => void;
  onCheck: () => void;
  onRevoke: () => void;
}) {
  const consent: OpenFinanceConsent | null = institution.consent;
  const status = consent?.status ?? null;

  return (
    <View testID={`openfinance-instituicao-${institution.id}`} className="border-b border-neutral-100 py-4">
      <View className="flex-row items-center gap-2">
        <Text className="font-medium text-neutral-900">{institution.name}</Text>
        {status && (
          <View testID={`openfinance-status-${institution.id}`} className={`rounded-full px-2 py-0.5 ${STATUS_CLASSES[status]}`}>
            <Text className={`text-xs ${STATUS_TEXT_CLASSES[status]}`}>{STATUS_LABELS[status]}</Text>
          </View>
        )}
      </View>
      <Text className="mt-1 text-xs text-neutral-500">
        {status === 'authorized' && consent?.expiresAt
          ? `Vigente ate ${consent.expiresAt.slice(0, 10)}`
          : status === 'pending'
            ? 'Aguardando autorizacao no provedor'
            : 'Sem conexao'}
      </Text>

      <View className="mt-3 flex-row flex-wrap items-center gap-2">
        {!consent && (
          <Pressable
            testID={`openfinance-conectar-${institution.id}`}
            disabled={busy}
            onPress={onConnect}
            className={`flex-row items-center gap-1 rounded-lg bg-brand-600 px-3 py-1 ${busy ? 'opacity-50' : ''}`}
          >
            <Link2 size={14} color="white" />
            <Text className="text-xs font-medium text-white">{busy ? 'Conectando...' : 'Conectar'}</Text>
          </Pressable>
        )}
        {status === 'pending' && (
          <>
            {consent?.consentUrl && (
              <Pressable
                testID={`openfinance-autorizar-${institution.id}`}
                onPress={() => {}}
                className="flex-row items-center gap-1 rounded-lg border border-neutral-300 bg-white px-3 py-1"
              >
                <ShieldCheck size={14} color="#0f172a" />
                <Text className="text-xs font-medium text-neutral-900">Autorizar</Text>
              </Pressable>
            )}
            <Pressable
              testID={`openfinance-verificar-${institution.id}`}
              disabled={busy}
              onPress={onCheck}
              className={`flex-row items-center gap-1 rounded-lg bg-brand-600 px-3 py-1 ${busy ? 'opacity-50' : ''}`}
            >
              <RefreshCw size={14} color="white" />
              <Text className="text-xs font-medium text-white">{busy ? 'Verificando...' : 'Verificar'}</Text>
            </Pressable>
          </>
        )}
        {status === 'authorized' && (
          <>
            <Pressable
              testID={`openfinance-reconsultar-${institution.id}`}
              disabled={busy}
              onPress={onCheck}
              className="flex-row items-center gap-1 rounded-lg border border-neutral-300 bg-white px-3 py-1"
            >
              <RefreshCw size={14} color="#0f172a" />
              <Text className="text-xs font-medium text-neutral-900">Reconsultar</Text>
            </Pressable>
            <Pressable
              testID={`openfinance-revogar-${institution.id}`}
              disabled={busy}
              onPress={onRevoke}
              className="flex-row items-center gap-1 rounded-lg border border-neutral-300 bg-white px-3 py-1"
            >
              <Unplug size={14} color="#0f172a" />
              <Text className="text-xs font-medium text-neutral-900">Revogar</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

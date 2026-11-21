import { useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, RefreshControl, Linking } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../src/auth/AuthContext';
import { API_BASE_URL, apiFetch } from '../../src/lib/api';
import type { CreateReportJobRequest, ReportJob, ReportJobStatus } from '@scf/api-contracts';
import { Check, Download, FileText, Plus, X } from 'lucide-react-native';

const STATUS_LABELS: Record<ReportJobStatus, string> = {
  pending: 'Pendente',
  running: 'Processando',
  done: 'Concluido',
  error: 'Erro',
};

/** Cor do selo de status; acompanha a paleta usada nas demais telas. */
function statusColors(status: ReportJobStatus): { bg: string; text: string } {
  if (status === 'done') return { bg: 'bg-success-50', text: 'text-success-700' };
  if (status === 'error') return { bg: 'bg-danger-50', text: 'text-danger-700' };
  if (status === 'running') return { bg: 'bg-brand-50', text: 'text-brand-700' };
  return { bg: 'bg-neutral-50', text: 'text-neutral-600' };
}

/** Rotulo do periodo do job; sem filtros cobre o intervalo padrao do servidor. */
function periodLabel(job: ReportJob): string {
  const { from, to } = job.params;
  if (!from && !to) return 'Ultimos 30 dias';
  return `${from ?? 'inicio'} a ${to ?? 'hoje'}`;
}

export default function ReportJobsScreen() {
  const { currentSpaceId } = useAuth();
  const qc = useQueryClient();

  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const jobsQ = useQuery({
    queryKey: ['report-jobs', currentSpaceId],
    enabled: !!currentSpaceId,
    queryFn: () => apiFetch<ReportJob[]>(`/financial-spaces/${currentSpaceId}/reports`),
  });

  const jobs = jobsQ.data ?? [];

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ['report-jobs', currentSpaceId] });
  }

  async function downloadJob(job: ReportJob) {
    if (!currentSpaceId) return;
    const url = `${API_BASE_URL}/financial-spaces/${currentSpaceId}/reports/${job.id}/download`;
    await Linking.openURL(url).catch(() => {
      setError('Nao foi possivel baixar o relatorio');
    });
  }

  return (
    <ScrollView
      className="flex-1 bg-neutral-50"
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={jobsQ.isFetching}
          onRefresh={() => jobsQ.refetch()}
          tintColor="#1e57f5"
        />
      }
    >
      <View className="flex-row items-start justify-between">
        <View className="flex-1">
          <Text className="text-2xl font-bold text-neutral-900">Relatorios assincronos</Text>
          <Text className="text-sm text-neutral-500">
            Solicite a exportacao de lancamentos em CSV. O relatorio e processado em background e
            fica disponivel para download quando concluido.
          </Text>
        </View>
        <Pressable
          testID="relatorio-novo"
          onPress={() => setShowCreate((v) => !v)}
          className="ml-3 flex-row items-center gap-1 rounded-lg bg-brand-600 px-3 py-2"
        >
          {showCreate ? <X size={16} color="white" /> : <Plus size={16} color="white" />}
          <Text className="text-sm font-medium text-white">{showCreate ? 'Cancelar' : 'Nova'}</Text>
        </Pressable>
      </View>

      {error && (
        <View className="mt-3 rounded-lg border border-danger-200 bg-danger-50 px-3 py-2">
          <Text className="text-sm text-danger-700">{error}</Text>
        </View>
      )}

      {showCreate && (
        <ReportJobForm
          spaceId={currentSpaceId}
          onCreated={async () => {
            setShowCreate(false);
            await refresh();
          }}
        />
      )}

      <View className="mt-4 rounded-xl border border-neutral-200 bg-white shadow-sm">
        <View className="border-b border-neutral-100 p-4">
          <Text className="text-base font-semibold text-neutral-900">Solicitacoes</Text>
          <Text className="mt-0.5 text-xs text-neutral-500">Mais recentes primeiro</Text>
        </View>
        <View className="p-4">
          {jobsQ.isLoading && <Text className="text-sm text-neutral-500">Carregando...</Text>}
          {!jobsQ.isLoading && jobs.length === 0 && (
            <View className="flex-row items-center gap-3">
              <FileText size={18} color="#94a3b8" />
              <Text className="flex-1 text-sm text-neutral-600">Nenhum relatorio solicitado.</Text>
            </View>
          )}
          {jobs.map((job) => (
            <ReportJobRow key={job.id} job={job} onDownload={downloadJob} />
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

function ReportJobRow({ job, onDownload }: { job: ReportJob; onDownload: (job: ReportJob) => void }) {
  const colors = statusColors(job.status);
  return (
    <View testID={`relatorio-item-${job.id}`} className="border-b border-neutral-100 py-4">
      <View className="flex-row items-center gap-2">
        <Text className="flex-1 font-medium text-neutral-900">Exportacao de lancamentos (CSV)</Text>
        <Text className={`rounded-full px-2 py-0.5 text-xs font-medium ${colors.bg} ${colors.text}`}>
          {STATUS_LABELS[job.status]}
        </Text>
      </View>
      <Text className="mt-1 text-xs text-neutral-500">
        Periodo: {periodLabel(job)} · criado em {job.createdAt.slice(0, 10)}
        {job.status === 'done' && job.rowCount !== null ? ` · ${job.rowCount} linhas` : ''}
      </Text>
      {job.status === 'error' && job.error && (
        <Text className="mt-1 text-xs text-danger-700">{job.error}</Text>
      )}

      {job.status === 'done' && (
        <Pressable
          testID={`relatorio-baixar-${job.id}`}
          onPress={() => onDownload(job)}
          className="mt-3 flex-row items-center gap-1 self-start rounded-lg border border-neutral-300 bg-white px-3 py-1"
        >
          <Download size={14} color="#0f172a" />
          <Text className="text-xs font-medium text-neutral-900">Baixar</Text>
        </Pressable>
      )}
    </View>
  );
}

function ReportJobForm({ spaceId, onCreated }: { spaceId: string | null; onCreated: () => void }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!spaceId) return;
    setError(null);
    setBusy(true);
    try {
      const body: CreateReportJobRequest = {
        type: 'transactions_export',
        ...(from.trim() ? { from: from.trim() } : {}),
        ...(to.trim() ? { to: to.trim() } : {}),
      };
      await apiFetch(`/financial-spaces/${spaceId}/reports`, { method: 'POST', json: body });
      setFrom('');
      setTo('');
      onCreated();
    } catch (e: any) {
      setError(e?.details?.message ?? e?.message ?? 'Nao foi possivel solicitar o relatorio');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="mt-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <Text className="text-base font-semibold text-neutral-900">Novo relatorio</Text>
      <Text className="mt-0.5 text-xs text-neutral-500">
        Periodo opcional; por padrao, os ultimos 30 dias.
      </Text>

      {error && (
        <Text className="mt-3 rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-700">{error}</Text>
      )}

      <Text className="mt-3 text-xs font-medium text-neutral-700">De</Text>
      <TextInput
        testID="relatorio-de"
        className="mt-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-neutral-900"
        placeholder="AAAA-MM-DD"
        placeholderTextColor="#94a3b8"
        value={from}
        onChangeText={setFrom}
      />

      <Text className="mt-3 text-xs font-medium text-neutral-700">Ate</Text>
      <TextInput
        testID="relatorio-ate"
        className="mt-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-neutral-900"
        placeholder="AAAA-MM-DD"
        placeholderTextColor="#94a3b8"
        value={to}
        onChangeText={setTo}
      />

      <Pressable
        testID="relatorio-criar"
        disabled={busy}
        onPress={submit}
        className={`mt-4 flex-row items-center justify-center gap-1 rounded-lg bg-brand-600 px-4 py-2.5 ${busy ? 'opacity-50' : ''}`}
      >
        <Check size={16} color="white" />
        <Text className="text-sm font-medium text-white">
          {busy ? 'Solicitando...' : 'Solicitar relatorio'}
        </Text>
      </Pressable>
    </View>
  );
}

'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/components/auth/AuthContext';
import { apiFetch } from '@/lib/api-client';
import type {
  CreateOpenFinanceConsentRequest,
  OpenFinanceConsent,
  OpenFinanceConsentStatus,
  OpenFinanceInstitution,
} from '@scf/api-contracts';
import { Link2, RefreshCw, ShieldCheck, Unplug } from 'lucide-react';

/** Rotulos e cores por situacao do consentimento. */
const STATUS_LABELS: Record<OpenFinanceConsentStatus, string> = {
  pending: 'Autorizacao pendente',
  authorized: 'Conectado',
  rejected: 'Recusado',
  expired: 'Expirado',
  revoked: 'Revogado',
};

const STATUS_CLASSES: Record<OpenFinanceConsentStatus, string> = {
  pending: 'bg-warning-50 text-warning-700',
  authorized: 'bg-success-50 text-success-700',
  rejected: 'bg-danger-50 text-danger-700',
  expired: 'bg-neutral-100 text-neutral-600',
  revoked: 'bg-neutral-100 text-neutral-600',
};

export default function OpenFinancePage() {
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
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Open Finance</h1>
        <p className="text-sm text-neutral-500">
          Conecte instituicoes via Open Finance. A autorizacao acontece no ambiente do provedor; aqui
          voce acompanha, reconsulta e revoga cada consentimento do espaco.
        </p>
      </header>

      {error && (
        <div className="rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700">
          {error}
        </div>
      )}

      <section className="card">
        <div className="card-header">
          <h2 className="card-title">Instituicoes</h2>
          <p className="card-subtitle">Cada instituicao aceita um consentimento por espaco</p>
        </div>
        <div className="card-body">
          {institutionsQ.isLoading && <p className="text-sm text-neutral-500">Carregando...</p>}
          {!institutionsQ.isLoading && institutions.length === 0 && (
            <div className="flex items-center gap-3 text-sm text-neutral-600">
              <Link2 className="h-5 w-5 text-neutral-400" />
              Nenhuma instituicao disponivel no provedor.
            </div>
          )}

          <ul className="divide-y divide-neutral-100">
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
          </ul>
        </div>
      </section>
    </div>
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
    <li data-testid={`openfinance-instituicao-${institution.id}`} className="py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-medium text-neutral-900">
            {institution.name}
            {status && (
              <span
                data-testid={`openfinance-status-${institution.id}`}
                className={`rounded-full px-2 py-0.5 text-xs ${STATUS_CLASSES[status]}`}
              >
                {STATUS_LABELS[status]}
              </span>
            )}
          </div>
          <div className="text-xs text-neutral-500">
            {status === 'authorized' && consent?.expiresAt
              ? `Vigente ate ${consent.expiresAt.slice(0, 10)}`
              : status === 'pending'
                ? 'Aguardando autorizacao no provedor'
                : 'Sem conexao'}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!consent && (
            <button
              type="button"
              className="btn-primary"
              data-testid={`openfinance-conectar-${institution.id}`}
              onClick={onConnect}
              disabled={busy}
            >
              <Link2 className="h-4 w-4" /> {busy ? 'Conectando...' : 'Conectar'}
            </button>
          )}
          {status === 'pending' && (
            <>
              {consent?.consentUrl && (
                <a
                  className="btn-outline"
                  data-testid={`openfinance-autorizar-${institution.id}`}
                  href={consent.consentUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ShieldCheck className="h-4 w-4" /> Autorizar
                </a>
              )}
              <button
                type="button"
                className="btn-primary"
                data-testid={`openfinance-verificar-${institution.id}`}
                onClick={onCheck}
                disabled={busy}
              >
                <RefreshCw className="h-4 w-4" /> {busy ? 'Verificando...' : 'Verificar'}
              </button>
            </>
          )}
          {status === 'authorized' && (
            <>
              <button
                type="button"
                className="btn-outline"
                data-testid={`openfinance-reconsultar-${institution.id}`}
                onClick={onCheck}
                disabled={busy}
              >
                <RefreshCw className="h-4 w-4" /> Reconsultar
              </button>
              <button
                type="button"
                className="btn-outline"
                data-testid={`openfinance-revogar-${institution.id}`}
                onClick={onRevoke}
                disabled={busy}
              >
                <Unplug className="h-4 w-4" /> Revogar
              </button>
            </>
          )}
        </div>
      </div>
    </li>
  );
}

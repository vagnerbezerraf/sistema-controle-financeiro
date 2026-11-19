'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/components/auth/AuthContext';
import type { AcceptSpaceInviteResponse } from '@scf/api-contracts';
import { CheckCircle2, MailCheck } from 'lucide-react';

export default function AcceptInvitePage() {
  return (
    <Suspense
      fallback={<div className="card mx-auto max-w-lg p-8 text-center text-sm text-neutral-500">Carregando...</div>}
    >
      <AcceptInviteForm />
    </Suspense>
  );
}

function AcceptInviteForm() {
  const search = useSearchParams();
  const token = search.get('token') ?? '';
  const { refresh, setCurrentSpace } = useAuth();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<AcceptSpaceInviteResponse | null>(null);

  async function accept() {
    setError(null);
    setBusy(true);
    try {
      const res = await apiFetch<AcceptSpaceInviteResponse>('/space-invites/accept', {
        method: 'POST',
        json: { token },
      });
      setAccepted(res);
      await refresh();
      setCurrentSpace(res.spaceId);
    } catch (e: any) {
      setError(e?.details?.message ?? e?.message ?? 'Nao foi possivel aceitar o convite');
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <div className="card mx-auto max-w-lg p-8 text-center">
        <h1 className="card-title">Convite invalido</h1>
        <p className="card-subtitle mt-2">
          Este link de convite esta incompleto. Solicite um novo convite ao administrador do espaco.
        </p>
        <Link href="/app/dashboard" className="btn-outline mt-6 inline-flex">Ir para o dashboard</Link>
      </div>
    );
  }

  if (accepted) {
    return (
      <div
        className="card mx-auto max-w-lg p-8 text-center"
        data-testid="convite-aceite-sucesso"
      >
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success-50 text-success-600">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <h1 className="card-title mt-4">Convite aceito</h1>
        <p className="card-subtitle mt-2">
          Voce agora faz parte de <span className="font-medium text-neutral-700">{accepted.financialSpaceName}</span>.
        </p>
        <Link href="/app/dashboard" className="btn-primary mt-6 inline-flex" data-testid="convite-ir-espaco">
          Ir para o espaco
        </Link>
      </div>
    );
  }

  return (
    <div className="card mx-auto max-w-lg p-8 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
        <MailCheck className="h-6 w-6" />
      </div>
      <h1 className="card-title mt-4">Convite para espaco financeiro</h1>
      <p className="card-subtitle mt-2">
        Ao aceitar, voce passa a ter acesso aos dados deste espaco financeiro com o papel definido
        pelo convite.
      </p>

      {error && (
        <div
          data-testid="convite-aceite-erro"
          className="mt-4 rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700"
        >
          {error}
        </div>
      )}

      <button
        type="button"
        className="btn-primary mt-6"
        data-testid="convite-aceitar"
        disabled={busy}
        onClick={accept}
      >
        {busy ? 'Aceitando...' : 'Aceitar convite'}
      </button>
      <p className="mt-4 text-xs text-neutral-500">
        O convite e vinculado ao e-mail da sua conta. Entre com o e-mail que recebeu o convite.
      </p>
    </div>
  );
}

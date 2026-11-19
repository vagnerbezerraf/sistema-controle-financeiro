'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/components/auth/AuthContext';
import { apiFetch } from '@/lib/api-client';
import { formatDate, cls } from '@/lib/format';
import type {
  CreateSpaceInviteResponse,
  FinancialSpaceRole,
  SpaceInvite,
  SpaceMember,
} from '@scf/api-contracts';
import { CheckCircle2, Copy, MailPlus, Trash2, UserMinus, Users } from 'lucide-react';

const ROLE_LABELS: Record<FinancialSpaceRole, string> = {
  owner: 'Proprietario',
  admin: 'Administrador',
  contributor: 'Colaborador',
  viewer: 'Somente leitura',
};

/** Papeis que o ator pode atribuir (espelha o dominio da API). */
function assignableRoles(actor: FinancialSpaceRole | null): FinancialSpaceRole[] {
  if (actor === 'owner') return ['admin', 'contributor', 'viewer'];
  if (actor === 'admin') return ['contributor', 'viewer'];
  return [];
}

/** O dono do espaco nao pode ter o papel alterado nem ser removido. */
function canChangeRole(actor: FinancialSpaceRole | null, target: FinancialSpaceRole): boolean {
  if (!actor || target === 'owner') return false;
  return assignableRoles(actor).length > 0;
}

function canRemove(actor: FinancialSpaceRole | null, target: FinancialSpaceRole): boolean {
  if (!actor || target === 'owner') return false;
  if (actor === 'owner') return true;
  if (actor === 'admin') return target === 'contributor' || target === 'viewer';
  return false;
}

export default function MembersPage() {
  const { currentSpaceId, spaces, roleInCurrentSpace, user } = useAuth();
  const qc = useQueryClient();

  const canManage = roleInCurrentSpace === 'owner' || roleInCurrentSpace === 'admin';
  const allowedRoles = assignableRoles(roleInCurrentSpace);

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<FinancialSpaceRole>('contributor');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  const membersQ = useQuery({
    queryKey: ['members', currentSpaceId],
    enabled: !!currentSpaceId,
    queryFn: () => apiFetch<SpaceMember[]>(`/financial-spaces/${currentSpaceId}/members`),
  });

  const invitesQ = useQuery({
    queryKey: ['invites', currentSpaceId],
    enabled: !!currentSpaceId && canManage,
    queryFn: () => apiFetch<SpaceInvite[]>(`/financial-spaces/${currentSpaceId}/invites`),
  });

  const members = membersQ.data ?? [];
  const invites = invitesQ.data ?? [];
  const spaceName = spaces.find((s) => s.id === currentSpaceId)?.name ?? 'este espaco';

  async function refresh() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['members', currentSpaceId] }),
      qc.invalidateQueries({ queryKey: ['invites', currentSpaceId] }),
    ]);
  }

  async function sendInvite(event: React.FormEvent) {
    event.preventDefault();
    if (!currentSpaceId) return;
    setError(null);
    setNotice(null);
    setInviteLink(null);
    setBusy(true);
    try {
      const res = await apiFetch<CreateSpaceInviteResponse>(
        `/financial-spaces/${currentSpaceId}/invites`,
        { method: 'POST', json: { email: email.trim(), role } },
      );
      setNotice(`Convite enviado para ${res.invite.email}.`);
      setInviteLink(res.acceptUrl);
      setEmail('');
      await refresh();
    } catch (e: any) {
      setError(e?.details?.message ?? e?.message ?? 'Nao foi possivel enviar o convite');
    } finally {
      setBusy(false);
    }
  }

  async function revokeInvite(invite: SpaceInvite) {
    if (!currentSpaceId) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await apiFetch(`/financial-spaces/${currentSpaceId}/invites/${invite.id}`, { method: 'DELETE' });
      setNotice(`Convite de ${invite.email} revogado.`);
      await refresh();
    } catch (e: any) {
      setError(e?.details?.message ?? e?.message ?? 'Nao foi possivel revogar o convite');
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(member: SpaceMember, nextRole: FinancialSpaceRole) {
    if (!currentSpaceId || nextRole === member.role) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await apiFetch(`/financial-spaces/${currentSpaceId}/members/${member.id}`, {
        method: 'PATCH',
        json: { role: nextRole },
      });
      setNotice(`Papel de ${member.email} atualizado para ${ROLE_LABELS[nextRole]}.`);
      await refresh();
    } catch (e: any) {
      setError(e?.details?.message ?? e?.message ?? 'Nao foi possivel alterar o papel');
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(member: SpaceMember) {
    if (!currentSpaceId) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await apiFetch(`/financial-spaces/${currentSpaceId}/members/${member.id}`, { method: 'DELETE' });
      setNotice(`${member.email} removido do espaco.`);
      await refresh();
    } catch (e: any) {
      setError(e?.details?.message ?? e?.message ?? 'Nao foi possivel remover o membro');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Membros</h1>
        <p className="text-sm text-neutral-500">
          Membros e convites de <span className="font-medium text-neutral-700">{spaceName}</span>.
          {roleInCurrentSpace && (
            <>
              {' '}Seu papel: <span className="font-medium text-neutral-700">{ROLE_LABELS[roleInCurrentSpace]}</span>.
            </>
          )}
        </p>
      </header>

      {error && (
        <div
          data-testid="membros-erro"
          className="rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700"
        >
          {error}
        </div>
      )}
      {notice && (
        <div
          data-testid="membros-sucesso"
          className="flex items-center gap-3 rounded-md border border-success-200 bg-success-50 px-3 py-2 text-sm text-success-700"
        >
          <CheckCircle2 className="h-4 w-4" /> {notice}
        </div>
      )}
      {inviteLink && (
        <div className="card" data-testid="convite-link">
          <div className="card-body space-y-2 text-sm">
            <p className="text-neutral-600">
              Compartilhe este link com o convidado. Ele expira em 7 dias.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded-md bg-neutral-50 px-3 py-2 text-xs text-neutral-800">
                {inviteLink}
              </code>
              <CopyButton value={inviteLink} />
            </div>
          </div>
        </div>
      )}

      {canManage && (
        <section className="card">
          <div className="card-header">
            <div className="flex items-center gap-2">
              <MailPlus className="h-5 w-5 text-neutral-500" />
              <h2 className="card-title text-lg">Convidar membro</h2>
            </div>
            <p className="card-subtitle">
              O convite so libera acesso depois que o convidado aceitar com o e-mail informado.
            </p>
          </div>
          <form className="card-body" onSubmit={sendInvite}>
            <div className="grid gap-3 md:grid-cols-[1fr_200px_auto] md:items-end">
              <div>
                <label htmlFor="inviteEmail" className="label block">E-mail</label>
                <input
                  id="inviteEmail"
                  data-testid="convite-email"
                  className="input mt-1"
                  type="email"
                  placeholder="pessoa@exemplo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="inviteRole" className="label block">Papel</label>
                <select
                  id="inviteRole"
                  data-testid="convite-papel"
                  className="input mt-1"
                  value={role}
                  onChange={(e) => setRole(e.target.value as FinancialSpaceRole)}
                >
                  {allowedRoles.map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                className="btn-primary"
                data-testid="convite-enviar"
                disabled={busy || !email.trim() || allowedRoles.length === 0}
              >
                <MailPlus className="h-4 w-4" /> {busy ? 'Enviando...' : 'Enviar convite'}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="card">
        <div className="card-header">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-neutral-500" />
            <h2 className="card-title text-lg">Membros ativos</h2>
          </div>
        </div>
        <div className="card-body">
          {membersQ.isLoading && <p className="text-sm text-neutral-500">Carregando...</p>}
          {!membersQ.isLoading && members.length === 0 && (
            <p className="text-sm text-neutral-600">Nenhum membro encontrado.</p>
          )}
          <ul data-testid="membros-lista" className="divide-y divide-neutral-100">
            {members.map((member) => {
              const editable = canManage && canChangeRole(roleInCurrentSpace, member.role);
              const removable =
                canManage && member.userId !== user?.id && canRemove(roleInCurrentSpace, member.role);
              return (
                <li
                  key={member.id}
                  data-testid={`membro-${member.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-neutral-900">
                        {member.name ?? member.email}
                      </span>
                      {member.userId === user?.id && (
                        <span className="badge border-neutral-200 bg-neutral-50 text-neutral-600">voce</span>
                      )}
                    </div>
                    <div className="text-xs text-neutral-500">
                      {member.email}
                      {member.joinedAt ? ` · entrou em ${formatDate(member.joinedAt)}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {editable ? (
                      <select
                        aria-label={`Papel de ${member.email}`}
                        data-testid={`membro-papel-${member.id}`}
                        className="input h-9 w-44"
                        value={member.role}
                        disabled={busy}
                        onChange={(e) => changeRole(member, e.target.value as FinancialSpaceRole)}
                      >
                        {[member.role, ...allowedRoles.filter((r) => r !== member.role)].map((r) => (
                          <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                        ))}
                      </select>
                    ) : (
                      <span className={cls('badge', roleBadge(member.role))}>{ROLE_LABELS[member.role]}</span>
                    )}
                    {removable && (
                      <button
                        type="button"
                        className="btn-outline text-danger-700"
                        data-testid={`membro-remover-${member.id}`}
                        disabled={busy}
                        onClick={() => removeMember(member)}
                      >
                        <UserMinus className="h-4 w-4" /> Remover
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {canManage && (
        <section className="card">
          <div className="card-header">
            <h2 className="card-title text-lg">Convites pendentes</h2>
          </div>
          <div className="card-body">
            {invitesQ.isLoading && <p className="text-sm text-neutral-500">Carregando...</p>}
            {!invitesQ.isLoading && invites.length === 0 && (
              <p data-testid="convites-vazio" className="text-sm text-neutral-600">
                Nenhum convite pendente.
              </p>
            )}
            <ul data-testid="convites-lista" className="divide-y divide-neutral-100">
              {invites.map((invite) => (
                <li
                  key={invite.id}
                  data-testid={`convite-pendente-${invite.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-neutral-900">{invite.email}</div>
                    <div className="text-xs text-neutral-500">
                      {ROLE_LABELS[invite.role]} · expira em {formatDate(invite.expiresAt)}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn-outline text-danger-700"
                    data-testid={`convite-revogar-${invite.id}`}
                    disabled={busy}
                    onClick={() => revokeInvite(invite)}
                  >
                    <Trash2 className="h-4 w-4" /> Revogar
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}

function roleBadge(role: FinancialSpaceRole): string {
  switch (role) {
    case 'owner':
      return 'border-brand-200 bg-brand-50 text-brand-700';
    case 'admin':
      return 'border-success-200 bg-success-50 text-success-700';
    default:
      return 'border-neutral-200 bg-neutral-50 text-neutral-600';
  }
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn-outline"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {copied ? 'Copiado' : 'Copiar'}
    </button>
  );
}

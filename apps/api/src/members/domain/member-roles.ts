/**
 * Regras puras de papeis em um espaco financeiro compartilhado.
 * Sem acesso a banco: recebe papeis e devolve decisoes de permissao.
 */

export type SpaceRole = 'owner' | 'admin' | 'contributor' | 'viewer';

const MANAGE_ROLES: SpaceRole[] = ['owner', 'admin'];

/** Papel com permissao para administrar membros (convidar, remover, mudar papel). */
export function canManageMembers(actorRole: SpaceRole): boolean {
  return MANAGE_ROLES.includes(actorRole);
}

/**
 * Papeis que o ator pode atribuir. O papel `owner` nunca e atribuivel por
 * convite/promocao: a propriedade e unica e definida na criacao do espaco.
 */
export function assignableRoles(actorRole: SpaceRole): SpaceRole[] {
  switch (actorRole) {
    case 'owner':
      return ['admin', 'contributor', 'viewer'];
    case 'admin':
      return ['contributor', 'viewer'];
    default:
      return [];
  }
}

export function canAssignRole(actorRole: SpaceRole, nextRole: SpaceRole): boolean {
  return assignableRoles(actorRole).includes(nextRole);
}

/** O dono do espaco nao pode ter o papel alterado nem ser removido. */
export function isProtectedMember(targetRole: SpaceRole): boolean {
  return targetRole === 'owner';
}

export function canChangeMemberRole(
  actorRole: SpaceRole,
  targetRole: SpaceRole,
  nextRole: SpaceRole,
): boolean {
  if (!canManageMembers(actorRole)) return false;
  if (isProtectedMember(targetRole)) return false;
  return canAssignRole(actorRole, nextRole);
}

export function canRemoveMember(actorRole: SpaceRole, targetRole: SpaceRole): boolean {
  if (!canManageMembers(actorRole)) return false;
  if (isProtectedMember(targetRole)) return false;
  if (actorRole === 'admin') return targetRole === 'contributor' || targetRole === 'viewer';
  return true;
}

export interface UsableInvite {
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  expiresAt: Date;
}

/** Um convite so pode ser aceito enquanto estiver pendente e dentro da validade. */
export function isInviteUsable(invite: UsableInvite, now: Date): boolean {
  return invite.status === 'pending' && invite.expiresAt.getTime() > now.getTime();
}

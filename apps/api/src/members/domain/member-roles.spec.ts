import { describe, expect, it } from 'vitest';
import {
  assignableRoles,
  canAssignRole,
  canChangeMemberRole,
  canManageMembers,
  canRemoveMember,
  isInviteUsable,
  isProtectedMember,
} from './member-roles';

const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('member-roles', () => {
  describe('canManageMembers', () => {
    it('permite administrar apenas para owner e admin', () => {
      expect(canManageMembers('owner')).toBe(true);
      expect(canManageMembers('admin')).toBe(true);
      expect(canManageMembers('contributor')).toBe(false);
      expect(canManageMembers('viewer')).toBe(false);
    });
  });

  describe('assignableRoles / canAssignRole', () => {
    it('owner atribui admin, colaborador e leitura; nunca outro owner', () => {
      expect(assignableRoles('owner')).toEqual(['admin', 'contributor', 'viewer']);
      expect(canAssignRole('owner', 'owner')).toBe(false);
      expect(canAssignRole('owner', 'admin')).toBe(true);
    });

    it('admin atribui apenas colaborador e leitura', () => {
      expect(assignableRoles('admin')).toEqual(['contributor', 'viewer']);
      expect(canAssignRole('admin', 'admin')).toBe(false);
      expect(canAssignRole('admin', 'viewer')).toBe(true);
    });

    it('colaborador e leitura nao atribuem papeis', () => {
      expect(assignableRoles('contributor')).toEqual([]);
      expect(assignableRoles('viewer')).toEqual([]);
    });
  });

  describe('canChangeMemberRole', () => {
    it('owner pode mudar o papel de um colaborador para admin', () => {
      expect(canChangeMemberRole('owner', 'contributor', 'admin')).toBe(true);
    });

    it('bloqueia quando o ator nao administra ou o alvo e o dono', () => {
      expect(canChangeMemberRole('contributor', 'viewer', 'viewer')).toBe(false);
      expect(canChangeMemberRole('admin', 'owner', 'viewer')).toBe(false);
    });

    it('admin nao promove ninguem a admin', () => {
      expect(canChangeMemberRole('admin', 'viewer', 'admin')).toBe(false);
      expect(canChangeMemberRole('admin', 'viewer', 'contributor')).toBe(true);
    });
  });

  describe('canRemoveMember', () => {
    it('owner remove qualquer membro que nao seja o dono', () => {
      expect(canRemoveMember('owner', 'admin')).toBe(true);
      expect(canRemoveMember('owner', 'contributor')).toBe(true);
      expect(canRemoveMember('owner', 'owner')).toBe(false);
    });

    it('admin remove apenas colaborador e leitura', () => {
      expect(canRemoveMember('admin', 'admin')).toBe(false);
      expect(canRemoveMember('admin', 'viewer')).toBe(true);
    });

    it('papeis sem administracao nao removem ninguem', () => {
      expect(canRemoveMember('viewer', 'contributor')).toBe(false);
    });
  });

  describe('isProtectedMember', () => {
    it('apenas o dono e protegido', () => {
      expect(isProtectedMember('owner')).toBe(true);
      expect(isProtectedMember('admin')).toBe(false);
    });
  });

  describe('isInviteUsable', () => {
    const agora = dia('2026-06-15');

    it('vale quando pendente e dentro da validade', () => {
      expect(isInviteUsable({ status: 'pending', expiresAt: dia('2026-06-20') }, agora)).toBe(true);
    });

    it('nao vale se expirado, aceito, revogado ou no limite exato', () => {
      expect(isInviteUsable({ status: 'pending', expiresAt: dia('2026-06-14') }, agora)).toBe(false);
      expect(isInviteUsable({ status: 'pending', expiresAt: dia('2026-06-15') }, agora)).toBe(false);
      expect(isInviteUsable({ status: 'accepted', expiresAt: dia('2026-06-20') }, agora)).toBe(false);
      expect(isInviteUsable({ status: 'revoked', expiresAt: dia('2026-06-20') }, agora)).toBe(false);
      expect(isInviteUsable({ status: 'expired', expiresAt: dia('2026-06-20') }, agora)).toBe(false);
    });
  });
});

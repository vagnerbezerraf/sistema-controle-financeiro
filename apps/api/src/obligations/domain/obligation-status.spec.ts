import { describe, expect, it } from 'vitest';
import {
  canTransitionObligation,
  isObligationOverdue,
  isStoredObligationStatus,
  reconcileStatusFor,
} from './obligation-status';

const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('obligation-status', () => {
  describe('isObligationOverdue', () => {
    const hoje = dia('2026-06-15');

    it('marca como vencida a obrigacao em aberto com prazo passado', () => {
      expect(isObligationOverdue({ status: 'pending', dueDate: dia('2026-06-14') }, hoje)).toBe(true);
      expect(isObligationOverdue({ status: 'forecast', dueDate: dia('2026-06-01') }, hoje)).toBe(true);
    });

    it('nao marca quando o vencimento e hoje ou futuro', () => {
      expect(isObligationOverdue({ status: 'pending', dueDate: dia('2026-06-15') }, hoje)).toBe(false);
      expect(isObligationOverdue({ status: 'pending', dueDate: dia('2026-07-01') }, hoje)).toBe(false);
    });

    it('nao marca obrigacao ja resolvida, ignorada ou cancelada', () => {
      const passado = dia('2026-01-01');
      expect(isObligationOverdue({ status: 'reconciled', dueDate: passado }, hoje)).toBe(false);
      expect(isObligationOverdue({ status: 'partially_reconciled', dueDate: passado }, hoje)).toBe(false);
      expect(isObligationOverdue({ status: 'ignored', dueDate: passado }, hoje)).toBe(false);
      expect(isObligationOverdue({ status: 'canceled', dueDate: passado }, hoje)).toBe(false);
    });
  });

  describe('canTransitionObligation', () => {
    it('permite as transicoes manuais do ciclo de vida', () => {
      expect(canTransitionObligation('forecast', 'pending')).toBe(true);
      expect(canTransitionObligation('pending', 'forecast')).toBe(true);
      expect(canTransitionObligation('pending', 'canceled')).toBe(true);
      expect(canTransitionObligation('ignored', 'pending')).toBe(true);
      expect(canTransitionObligation('canceled', 'pending')).toBe(true);
    });

    it('bloqueia saltos e estados derivados/de conciliacao', () => {
      expect(canTransitionObligation('forecast', 'reconciled')).toBe(false);
      expect(canTransitionObligation('forecast', 'partially_reconciled')).toBe(false);
      expect(canTransitionObligation('reconciled', 'pending')).toBe(false);
      expect(canTransitionObligation('partially_reconciled', 'reconciled')).toBe(false);
      expect(canTransitionObligation('pending', 'overdue')).toBe(false);
      expect(canTransitionObligation('pending', 'inexistente')).toBe(false);
    });
  });

  describe('reconcileStatusFor', () => {
    it('fica conciliada quando a transacao cobre o valor', () => {
      expect(reconcileStatusFor('100.00', '100.00')).toBe('reconciled');
      expect(reconcileStatusFor('100.00', '150.00')).toBe('reconciled');
    });

    it('fica parcialmente conciliada quando a transacao cobre so parte', () => {
      expect(reconcileStatusFor('100.00', '40.00')).toBe('partially_reconciled');
      // Comparacao em centavos: um centavo a menos ja e parcial.
      expect(reconcileStatusFor('33.34', '33.33')).toBe('partially_reconciled');
      expect(reconcileStatusFor('0.10', '0.09')).toBe('partially_reconciled');
    });
  });

  describe('isStoredObligationStatus', () => {
    it('reconhece apenas os estados persistidos', () => {
      expect(isStoredObligationStatus('forecast')).toBe(true);
      expect(isStoredObligationStatus('overdue')).toBe(false);
      expect(isStoredObligationStatus('qualquer')).toBe(false);
    });
  });
});

import { describe, expect, it } from 'vitest';
import {
  canRevoke,
  effectiveStatus,
  isConsentActive,
  isExpired,
  isTerminalStatus,
  normalizeStatus,
} from './open-finance';

const now = new Date('2026-06-15T12:00:00.000Z');

describe('open-finance (dominio)', () => {
  describe('isTerminalStatus', () => {
    it('marca rejected/expired/revoked como terminal', () => {
      expect(isTerminalStatus('rejected')).toBe(true);
      expect(isTerminalStatus('expired')).toBe(true);
      expect(isTerminalStatus('revoked')).toBe(true);
    });

    it('nao marca pending/authorized como terminal', () => {
      expect(isTerminalStatus('pending')).toBe(false);
      expect(isTerminalStatus('authorized')).toBe(false);
    });
  });

  describe('isExpired', () => {
    it('trata ausencia de prazo como nao expirado', () => {
      expect(isExpired(null, now)).toBe(false);
    });

    it('considera expirado quando o prazo ja passou (inclusive no limite)', () => {
      expect(isExpired('2026-06-15T11:59:59.000Z', now)).toBe(true);
      expect(isExpired(now.toISOString(), now)).toBe(true);
    });

    it('considera vigente quando o prazo esta no futuro', () => {
      expect(isExpired('2026-06-15T12:00:01.000Z', now)).toBe(false);
    });

    it('ignora prazo invalido', () => {
      expect(isExpired('nao-e-data', now)).toBe(false);
    });
  });

  describe('effectiveStatus', () => {
    it('reporta authorized vencido como expired', () => {
      expect(effectiveStatus('authorized', '2026-06-01T00:00:00.000Z', now)).toBe('expired');
    });

    it('mantem authorized dentro do prazo', () => {
      expect(effectiveStatus('authorized', '2026-07-01T00:00:00.000Z', now)).toBe('authorized');
    });

    it('nao mexe nos demais status', () => {
      expect(effectiveStatus('pending', '2026-06-01T00:00:00.000Z', now)).toBe('pending');
      expect(effectiveStatus('revoked', null, now)).toBe('revoked');
    });
  });

  describe('isConsentActive', () => {
    it('ativo apenas quando authorized e vigente', () => {
      expect(isConsentActive('authorized', '2026-07-01T00:00:00.000Z', now)).toBe(true);
      expect(isConsentActive('authorized', '2026-06-01T00:00:00.000Z', now)).toBe(false);
      expect(isConsentActive('pending', null, now)).toBe(false);
    });
  });

  describe('canRevoke', () => {
    it('permite revogar pending e authorized', () => {
      expect(canRevoke('pending')).toBe(true);
      expect(canRevoke('authorized')).toBe(true);
    });

    it('bloqueia estados terminais', () => {
      expect(canRevoke('rejected')).toBe(false);
      expect(canRevoke('expired')).toBe(false);
      expect(canRevoke('revoked')).toBe(false);
    });
  });

  describe('normalizeStatus', () => {
    it('traduz variacoes do provedor para o nosso vocabulario', () => {
      expect(normalizeStatus('AUTHORISED')).toBe('authorized');
      expect(normalizeStatus('active')).toBe('authorized');
      expect(normalizeStatus('updated')).toBe('authorized');
      expect(normalizeStatus('refused')).toBe('rejected');
      expect(normalizeStatus('error')).toBe('rejected');
      expect(normalizeStatus('deleted')).toBe('revoked');
      expect(normalizeStatus('expired')).toBe('expired');
    });

    it('cai em pending para valores desconhecidos', () => {
      expect(normalizeStatus('whatever')).toBe('pending');
      expect(normalizeStatus('  ')).toBe('pending');
    });
  });
});

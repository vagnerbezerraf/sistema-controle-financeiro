import { describe, expect, it } from 'vitest';
import {
  backoffDelayMs,
  isExhausted,
  isReady,
  nextAttemptAt,
  OUTBOX_BACKOFF_BASE_MS,
  OUTBOX_BACKOFF_MAX_MS,
  OUTBOX_FAILED,
  OUTBOX_MAX_ATTEMPTS,
  OUTBOX_PENDING,
  selectReadyEvents,
  type OutboxEventLike,
} from './outbox';

const evento = (over: Partial<OutboxEventLike>): OutboxEventLike => ({
  id: 'e1',
  status: OUTBOX_PENDING,
  attempts: 0,
  nextAttemptAt: null,
  createdAt: new Date('2026-06-15T10:00:00Z'),
  ...over,
});

describe('outbox (dominio)', () => {
  describe('backoffDelayMs', () => {
    it('cresce em dobro e comeca na base', () => {
      expect(backoffDelayMs(1)).toBe(OUTBOX_BACKOFF_BASE_MS);
      expect(backoffDelayMs(2)).toBe(OUTBOX_BACKOFF_BASE_MS * 2);
      expect(backoffDelayMs(3)).toBe(OUTBOX_BACKOFF_BASE_MS * 4);
    });

    it('respeita o teto do backoff', () => {
      expect(backoffDelayMs(20)).toBe(OUTBOX_BACKOFF_MAX_MS);
    });

    it('trata valores nao positivos como a primeira tentativa', () => {
      expect(backoffDelayMs(0)).toBe(OUTBOX_BACKOFF_BASE_MS);
      expect(backoffDelayMs(-3)).toBe(OUTBOX_BACKOFF_BASE_MS);
    });
  });

  describe('nextAttemptAt', () => {
    it('soma o backoff ao instante atual', () => {
      const agora = new Date('2026-06-15T10:00:00Z');
      expect(nextAttemptAt(agora, 2).toISOString()).toBe('2026-06-15T10:00:10.000Z');
    });
  });

  describe('isExhausted', () => {
    it('esgota ao alcancar o maximo de tentativas', () => {
      expect(isExhausted(OUTBOX_MAX_ATTEMPTS - 1)).toBe(false);
      expect(isExhausted(OUTBOX_MAX_ATTEMPTS)).toBe(true);
      expect(isExhausted(OUTBOX_MAX_ATTEMPTS + 1)).toBe(true);
    });
  });

  describe('isReady', () => {
    it('recusa eventos que nao estao pendentes', () => {
      expect(isReady(evento({ status: OUTBOX_FAILED }), new Date())).toBe(false);
      expect(isReady(evento({ status: 'published' }), new Date())).toBe(false);
    });

    it('aceita pendente sem horario marcado', () => {
      expect(isReady(evento({ nextAttemptAt: null }), new Date())).toBe(true);
    });

    it('aceita apenas quando o horario ja passou', () => {
      const agora = new Date('2026-06-15T10:00:00Z');
      expect(isReady(evento({ nextAttemptAt: new Date('2026-06-15T09:59:59Z') }), agora)).toBe(true);
      expect(isReady(evento({ nextAttemptAt: new Date('2026-06-15T10:00:01Z') }), agora)).toBe(false);
    });
  });

  describe('selectReadyEvents', () => {
    it('ordena por gravacao, descarta nao prontos e aplica o limite', () => {
      const agora = new Date('2026-06-15T10:00:00Z');
      const eventos = [
        evento({ id: 'c', createdAt: new Date('2026-06-15T09:03:00Z') }),
        evento({ id: 'a', createdAt: new Date('2026-06-15T09:01:00Z') }),
        evento({ id: 'b', createdAt: new Date('2026-06-15T09:02:00Z') }),
        evento({ id: 'd', createdAt: new Date('2026-06-15T09:04:00Z'), nextAttemptAt: new Date('2026-06-15T10:00:05Z') }),
        evento({ id: 'e', createdAt: new Date('2026-06-15T09:00:00Z'), status: OUTBOX_FAILED }),
      ];

      expect(selectReadyEvents(eventos, agora, 10).map((e) => e.id)).toEqual(['a', 'b', 'c']);
      expect(selectReadyEvents(eventos, agora, 2).map((e) => e.id)).toEqual(['a', 'b']);
      expect(selectReadyEvents(eventos, agora, 0)).toEqual([]);
    });
  });
});

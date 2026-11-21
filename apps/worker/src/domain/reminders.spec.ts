import { describe, expect, it } from 'vitest';
import {
  DEFAULT_OVERDUE_LOOKBACK_DAYS,
  DEFAULT_REMINDER_HORIZON_DAYS,
  buildReminderMessage,
  isOpenObligationStatus,
  isQuietAt,
  isWithinQuietHours,
  minutesOfDayInTimeZone,
  selectDueObligations,
  shouldRemindNow,
  type DueObligation,
  type ReminderRecipient,
} from './reminders';

const hoje = new Date('2026-06-15T12:00:00.000Z');

const obrigacao = (over: Partial<DueObligation> = {}): DueObligation => ({
  id: 'o1',
  financialSpaceId: 's1',
  description: 'Aluguel',
  type: 'expense',
  amount: '1500.00',
  currency: 'BRL',
  dueDate: '2026-06-16',
  status: 'pending',
  ...over,
});

const destinatario = (over: Partial<ReminderRecipient> = {}): ReminderRecipient => ({
  email: 'ana@example.com',
  name: 'Ana',
  timezone: 'America/Sao_Paulo',
  emailEnabled: true,
  includeAmounts: true,
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
  ...over,
});

describe('reminders (dominio)', () => {
  describe('selectDueObligations', () => {
    it('mantem as obrigacoes em aberto dentro do horizonte e do retrospecto', () => {
      const selecionadas = selectDueObligations(
        [
          obrigacao({ id: 'atrasada', dueDate: '2026-06-10' }),
          obrigacao({ id: 'hoje', dueDate: '2026-06-15' }),
          obrigacao({ id: 'limite', dueDate: '2026-06-18' }), // hoje + 3
          obrigacao({ id: 'futura', dueDate: '2026-06-20' }), // alem do horizonte
        ],
        { today: hoje },
      );

      expect(selecionadas.map((o) => o.id)).toEqual(['atrasada', 'hoje', 'limite']);
    });

    it('descarta as obrigacoes ja fechadas', () => {
      const selecionadas = selectDueObligations(
        [
          obrigacao({ id: 'forecast', status: 'forecast' }),
          obrigacao({ id: 'pendente', status: 'pending' }),
          obrigacao({ id: 'parcial', status: 'partially_reconciled' }),
          obrigacao({ id: 'conciliada', status: 'reconciled' }),
          obrigacao({ id: 'ignorada', status: 'ignored' }),
          obrigacao({ id: 'cancelada', status: 'canceled' }),
        ],
        { today: hoje },
      );

      expect(selecionadas.map((o) => o.id)).toEqual(['forecast', 'pendente', 'parcial']);
    });

    it('descarta o atraso alem do retrospecto', () => {
      const selecionadas = selectDueObligations(
        [
          obrigacao({ id: 'recente', dueDate: '2026-05-20' }), // 26 dias
          obrigacao({ id: 'antiga', dueDate: '2026-05-01' }), // 45 dias
        ],
        { today: hoje },
      );

      expect(selecionadas.map((o) => o.id)).toEqual(['recente']);
    });

    it('respeita horizontes informados explicitamente', () => {
      const selecionadas = selectDueObligations([obrigacao({ dueDate: '2026-06-15' })], {
        today: hoje,
        horizonDays: 0,
        overdueLookbackDays: 0,
      });

      expect(selecionadas).toHaveLength(1);
      expect(selectDueObligations([obrigacao({ dueDate: '2026-06-16' })], {
        today: hoje,
        horizonDays: 0,
        overdueLookbackDays: 0,
      })).toEqual([]);
    });

    it('ordena pelo vencimento e desempata pela descricao', () => {
      const selecionadas = selectDueObligations(
        [
          obrigacao({ id: 'b', dueDate: '2026-06-16', description: 'B' }),
          obrigacao({ id: 'a', dueDate: '2026-06-16', description: 'A' }),
          obrigacao({ id: 'c', dueDate: '2026-06-15', description: 'C' }),
        ],
        { today: hoje },
      );

      expect(selecionadas.map((o) => o.id)).toEqual(['c', 'a', 'b']);
    });

    it('usa os padroes de horizonte e retrospecto', () => {
      expect(DEFAULT_REMINDER_HORIZON_DAYS).toBe(3);
      expect(DEFAULT_OVERDUE_LOOKBACK_DAYS).toBe(30);
    });
  });

  it('isOpenObligationStatus reconhece apenas as situacoes em aberto', () => {
    expect(isOpenObligationStatus('forecast')).toBe(true);
    expect(isOpenObligationStatus('pending')).toBe(true);
    expect(isOpenObligationStatus('partially_reconciled')).toBe(true);
    expect(isOpenObligationStatus('reconciled')).toBe(false);
    expect(isOpenObligationStatus('ignored')).toBe(false);
    expect(isOpenObligationStatus('canceled')).toBe(false);
  });

  describe('horario silencioso', () => {
    it('converte o instante em minutos no fuso do destinatario', () => {
      expect(minutesOfDayInTimeZone(new Date('2026-06-15T12:00:00.000Z'), 'UTC')).toBe(720);
      // 12:00 UTC = 09:00 em Sao Paulo (UTC-3).
      expect(minutesOfDayInTimeZone(new Date('2026-06-15T12:00:00.000Z'), 'America/Sao_Paulo')).toBe(540);
    });

    it('cobre janelas no mesmo dia, cruzando a meia-noite e de tamanho zero', () => {
      expect(isWithinQuietHours('09:00', '17:00', 600)).toBe(true);
      expect(isWithinQuietHours('09:00', '17:00', 1200)).toBe(false);
      expect(isWithinQuietHours('22:00', '07:00', 23 * 60)).toBe(true);
      expect(isWithinQuietHours('22:00', '07:00', 6 * 60)).toBe(true);
      expect(isWithinQuietHours('22:00', '07:00', 12 * 60)).toBe(false);
      expect(isWithinQuietHours('08:00', '08:00', 480)).toBe(false);
      expect(isWithinQuietHours('invalido', '08:00', 480)).toBe(false);
    });

    it('isQuietAt respeita o liga/desliga e o fuso', () => {
      const dentro = destinatario({ quietHoursEnabled: true });
      // 01:00 UTC = 22:00 em Sao Paulo: dentro de [22:00, 07:00).
      expect(isQuietAt(dentro, new Date('2026-06-16T01:00:00.000Z'))).toBe(true);
      expect(isQuietAt(dentro, new Date('2026-06-15T15:00:00.000Z'))).toBe(false);
      expect(isQuietAt(destinatario({ quietHoursEnabled: false }), new Date('2026-06-16T01:00:00.000Z'))).toBe(false);
    });

    it('shouldRemindNow exige canal ligado e fora do silencio', () => {
      expect(shouldRemindNow(destinatario(), hoje)).toBe(true);
      expect(shouldRemindNow(destinatario({ emailEnabled: false }), hoje)).toBe(false);
      expect(
        shouldRemindNow(destinatario({ quietHoursEnabled: true }), new Date('2026-06-16T01:00:00.000Z')),
      ).toBe(false);
    });
  });

  describe('buildReminderMessage', () => {
    it('compõe o assunto no singular e no plural', () => {
      expect(buildReminderMessage(destinatario(), [obrigacao()], hoje).subject).toBe(
        'SCF: 1 compromisso a vencer',
      );
      expect(
        buildReminderMessage(destinatario(), [obrigacao(), obrigacao({ id: 'o2' })], hoje).subject,
      ).toBe('SCF: 2 compromissos a vencer');
    });

    it('marca o prazo conforme a distancia ate o vencimento', () => {
      const texto = buildReminderMessage(
        destinatario(),
        [
          obrigacao({ id: 'a', dueDate: '2026-06-10', description: 'Atrasada' }),
          obrigacao({ id: 'b', dueDate: '2026-06-15', description: 'Hoje' }),
          obrigacao({ id: 'c', dueDate: '2026-06-16', description: 'Amanha' }),
          obrigacao({ id: 'd', dueDate: '2026-06-18', description: 'Tres dias' }),
        ],
        hoje,
      ).text;

      expect(texto).toContain('- 2026-06-10 (atrasado)  Atrasada');
      expect(texto).toContain('- 2026-06-15 (vence hoje)  Hoje');
      expect(texto).toContain('- 2026-06-16 (em 1 dia)  Amanha');
      expect(texto).toContain('- 2026-06-18 (em 3 dias)  Tres dias');
    });

    it('so inclui valores quando a privacidade permitir', () => {
      const comValor = buildReminderMessage(destinatario({ includeAmounts: true }), [obrigacao()], hoje);
      expect(comValor.text).toContain('BRL 1500.00');

      const semValor = buildReminderMessage(destinatario({ includeAmounts: false }), [obrigacao()], hoje);
      expect(semValor.text).not.toContain('BRL');
      expect(semValor.text).toContain('Aluguel');
    });

    it('devolve destinatario e ids das obrigacoes', () => {
      const message = buildReminderMessage(
        destinatario(),
        [obrigacao({ id: 'o1' }), obrigacao({ id: 'o2' })],
        hoje,
      );

      expect(message.to).toBe('ana@example.com');
      expect(message.obligationIds).toEqual(['o1', 'o2']);
    });
  });
});

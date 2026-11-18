import { describe, expect, it } from 'vitest';
import {
  clampToMonth,
  closingDateOnOrAfter,
  cycleWindow,
  dueDateFor,
  invoiceIdFor,
  invoiceStatus,
} from './billing-cycle';

const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('billing-cycle', () => {
  describe('clampToMonth', () => {
    it('respeita o ultimo dia de cada mes', () => {
      expect(clampToMonth(2026, 1, 31).toISOString().slice(0, 10)).toBe('2026-02-28');
      expect(clampToMonth(2024, 1, 31).toISOString().slice(0, 10)).toBe('2024-02-29');
      expect(clampToMonth(2026, 3, 31).toISOString().slice(0, 10)).toBe('2026-04-30');
    });
  });

  describe('closingDateOnOrAfter', () => {
    it('usa o fechamento do mesmo mes quando a compra e antes dele', () => {
      expect(invoiceIdFor(closingDateOnOrAfter(dia('2026-03-10'), 25))).toBe('2026-03-25');
    });

    it('inclui a propria data de fechamento', () => {
      expect(invoiceIdFor(closingDateOnOrAfter(dia('2026-03-25'), 25))).toBe('2026-03-25');
    });

    it('vai para o mes seguinte quando a compra e depois do fechamento', () => {
      expect(invoiceIdFor(closingDateOnOrAfter(dia('2026-03-26'), 25))).toBe('2026-04-25');
    });

    it('ajusta o fechamento em meses mais curtos', () => {
      expect(invoiceIdFor(closingDateOnOrAfter(dia('2026-02-27'), 31))).toBe('2026-02-28');
      expect(invoiceIdFor(closingDateOnOrAfter(dia('2026-02-28'), 31))).toBe('2026-02-28');
      expect(invoiceIdFor(closingDateOnOrAfter(dia('2026-03-01'), 31))).toBe('2026-03-31');
    });
  });

  describe('cycleWindow', () => {
    it('comeca no dia seguinte ao fechamento anterior', () => {
      const { cycleStart, cycleEnd } = cycleWindow(dia('2026-03-25'), 25);
      expect(invoiceIdFor(cycleStart)).toBe('2026-02-26');
      expect(invoiceIdFor(cycleEnd)).toBe('2026-03-25');
    });

    it('lida com fechamento no ultimo dia do mes', () => {
      const { cycleStart } = cycleWindow(dia('2026-02-28'), 31);
      // O fechamento anterior (janeiro) cai em 31; o ciclo abre em 1 de fevereiro.
      expect(invoiceIdFor(cycleStart)).toBe('2026-02-01');
    });
  });

  describe('dueDateFor', () => {
    it('vence no mes seguinte quando o dia de vencimento e antes do fechamento', () => {
      expect(invoiceIdFor(dueDateFor(dia('2026-03-25'), 5))).toBe('2026-04-05');
    });

    it('vence no mesmo mes quando o dia de vencimento e depois do fechamento', () => {
      expect(invoiceIdFor(dueDateFor(dia('2026-03-25'), 30))).toBe('2026-03-30');
    });
  });

  describe('invoiceStatus', () => {
    const base = { total: 100, paid: 0, closingDate: dia('2026-03-25'), dueDate: dia('2026-04-05') };

    it('esta aberta enquanto o ciclo corre', () => {
      expect(invoiceStatus({ ...base, now: dia('2026-03-10') })).toBe('open');
    });

    it('esta fechada entre fechamento e vencimento', () => {
      expect(invoiceStatus({ ...base, now: dia('2026-03-30') })).toBe('closed');
    });

    it('esta vencida apos o vencimento sem pagamento', () => {
      expect(invoiceStatus({ ...base, now: dia('2026-04-06') })).toBe('overdue');
    });

    it('esta paga quando os creditos cobrem as compras', () => {
      expect(invoiceStatus({ ...base, paid: 100, now: dia('2026-04-01') })).toBe('paid');
    });

    it('nao muda de situacao por causa de arredondamento de centavos', () => {
      expect(invoiceStatus({ ...base, paid: 99.9999, now: dia('2026-04-01') })).toBe('paid');
    });
  });
});

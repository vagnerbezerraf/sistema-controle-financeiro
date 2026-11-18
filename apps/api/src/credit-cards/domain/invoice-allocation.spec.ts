import { describe, expect, it } from 'vitest';
import { allocatePaymentsFifo, round2 } from './invoice-allocation';

const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('allocatePaymentsFifo', () => {
  const faturas = [
    { id: '2026-03-25', closingDate: dia('2026-03-25'), total: 300 },
    { id: '2026-04-25', closingDate: dia('2026-04-25'), total: 200 },
  ];

  it('quita primeiro a fatura mais antiga', () => {
    const aplicado = allocatePaymentsFifo(faturas, 250);
    expect(aplicado.get('2026-03-25')).toBe(250);
    expect(aplicado.get('2026-04-25')).toBe(0);
  });

  it('transborda o excedente para a fatura seguinte', () => {
    const aplicado = allocatePaymentsFifo(faturas, 450);
    expect(aplicado.get('2026-03-25')).toBe(300);
    expect(aplicado.get('2026-04-25')).toBe(150);
  });

  it('nao aloca mais do que o total pago', () => {
    const aplicado = allocatePaymentsFifo(faturas, 10_000);
    expect(aplicado.get('2026-03-25')).toBe(300);
    expect(aplicado.get('2026-04-25')).toBe(200);
  });

  it('mantem precisa a distribuicao de centavos', () => {
    const comCentavos = [
      { id: 'a', closingDate: dia('2026-03-25'), total: 33.33 },
      { id: 'b', closingDate: dia('2026-04-25'), total: 33.33 },
      { id: 'c', closingDate: dia('2026-05-25'), total: 33.34 },
    ];
    const aplicado = allocatePaymentsFifo(comCentavos, 100);
    expect(aplicado.get('a')).toBe(33.33);
    expect(aplicado.get('b')).toBe(33.33);
    expect(aplicado.get('c')).toBe(33.34);
    expect(round2(33.33 + 33.33 + 33.34)).toBe(100);
  });

  it('nao aplica valor negativo', () => {
    const aplicado = allocatePaymentsFifo(faturas, -50);
    expect(aplicado.get('2026-03-25')).toBe(0);
    expect(aplicado.get('2026-04-25')).toBe(0);
  });
});

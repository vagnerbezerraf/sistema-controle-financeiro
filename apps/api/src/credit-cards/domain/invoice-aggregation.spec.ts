import { describe, expect, it } from 'vitest';
import { assembleInvoices, type InvoicePosting } from './invoice-aggregation';

const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const compra = (data: string, valor: number): InvoicePosting => ({
  amount: valor,
  direction: 'credit',
  effectiveDate: dia(data),
});
const pagamento = (data: string, valor: number): InvoicePosting => ({
  amount: valor,
  direction: 'debit',
  effectiveDate: dia(data),
});
// Data de referencia bem posterior as faturas dos testes, para status estavel.
const agora = dia('2030-01-01');

describe('assembleInvoices', () => {
  it('agrupa as compras na fatura do primeiro fechamento apos a data', () => {
    const faturas = assembleInvoices({
      postings: [compra('2026-03-10', 100), compra('2026-03-20', 50), compra('2026-03-26', 30)],
      closingDay: 25,
      dueDay: 5,
      now: agora,
    });

    // Duas faturas: a de 25/03 (100 + 50) e a de 25/04 (30, compra apos o fechamento).
    expect(faturas).toHaveLength(2);
    expect(faturas[0].id).toBe('2026-04-25');
    expect(faturas[0].totalAmount).toBe('30.00');
    expect(faturas[1].id).toBe('2026-03-25');
    expect(faturas[1].totalAmount).toBe('150.00');
  });

  it('deriva ciclo e vencimento da fatura', () => {
    const [fatura] = assembleInvoices({
      postings: [compra('2026-03-10', 100)],
      closingDay: 25,
      dueDay: 5,
      now: agora,
    });

    expect(fatura.closingDate).toBe('2026-03-25');
    // Ciclo comeca no dia seguinte ao fechamento anterior (25/02).
    expect(fatura.cycleStart).toBe('2026-02-26');
    expect(fatura.cycleEnd).toBe('2026-03-25');
    // Vencimento no mes seguinte, pois o dia 5 ja passou em relacao ao fechamento.
    expect(fatura.dueDate).toBe('2026-04-05');
  });

  it('distribui os pagamentos em cascata, da fatura mais antiga para a mais recente', () => {
    const faturas = assembleInvoices({
      postings: [compra('2026-03-10', 100), compra('2026-04-10', 100), pagamento('2026-05-01', 150)],
      closingDay: 25,
      dueDay: 5,
      now: agora,
    });

    const marco = faturas.find((f) => f.id === '2026-03-25')!;
    const abril = faturas.find((f) => f.id === '2026-04-25')!;
    expect(marco.status).toBe('paid');
    expect(marco.paidAmount).toBe('100.00');
    expect(abril.status).toBe('overdue');
    expect(abril.paidAmount).toBe('50.00');
    expect(abril.outstandingAmount).toBe('50.00');
  });

  it('marca a fatura como quitada quando os pagamentos cobrem o total', () => {
    const faturas = assembleInvoices({
      postings: [compra('2026-03-10', 200), pagamento('2026-03-20', 200)],
      closingDay: 25,
      dueDay: 5,
      now: agora,
    });

    expect(faturas).toHaveLength(1);
    expect(faturas[0].status).toBe('paid');
    expect(faturas[0].outstandingAmount).toBe('0.00');
  });

  it('nao gera fatura quando nao ha compras', () => {
    const faturas = assembleInvoices({
      postings: [pagamento('2026-03-20', 100)],
      closingDay: 25,
      dueDay: 5,
      now: agora,
    });

    expect(faturas).toHaveLength(0);
  });

  it('mantem o status aberto quando o fechamento ainda nao chegou', () => {
    const faturas = assembleInvoices({
      postings: [compra('2026-03-10', 100)],
      closingDay: 25,
      dueDay: 5,
      now: dia('2026-03-15'),
    });

    expect(faturas[0].status).toBe('open');
  });
});

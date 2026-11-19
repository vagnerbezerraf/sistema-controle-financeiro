import { describe, expect, it } from 'vitest';
import { parseOfx, parseOfxDate } from './ofx-import';

/** Bloco SGML (OFX 1.x): tags sem fechamento. */
const SGML = [
  '<OFX>',
  '<BANKTRANLIST>',
  '<STMTTRN>',
  '<TRNTYPE>DEBIT',
  '<DTPOSTED>20260615120000[-3:BRT]',
  '<TRNAMT>-100.00',
  '<FITID>0001',
  '<MEMO>Mercado</MEMO>',
  '</STMTTRN>',
  '<STMTTRN>',
  '<TRNTYPE>CREDIT',
  '<DTPOSTED>20260616',
  '<TRNAMT>5000.00',
  '<FITID>0002',
  '<NAME>Salario',
  '</STMTTRN>',
  '</BANKTRANLIST>',
  '</OFX>',
].join('\n');

describe('ofx-import', () => {
  describe('parseOfxDate', () => {
    it('interpreta a data basica YYYYMMDD', () => {
      expect(parseOfxDate('20260615')).toBe('2026-06-15');
    });

    it('ignora hora e fuso', () => {
      expect(parseOfxDate('20260615120000[-3:BRT]')).toBe('2026-06-15');
      expect(parseOfxDate('20260615.9999')).toBe('2026-06-15');
    });

    it('rejeita datas ausentes ou inexistentes', () => {
      expect(parseOfxDate('')).toBeNull();
      expect(parseOfxDate(null)).toBeNull();
      expect(parseOfxDate('20260230')).toBeNull();
      expect(parseOfxDate('data-ruim')).toBeNull();
    });
  });

  describe('parseOfx', () => {
    it('extrai um lancamento por STMTTRN', () => {
      const rows = parseOfx(SGML);
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({
        line: 1,
        date: '2026-06-15',
        description: 'Mercado',
        amount: '100.00',
        type: 'expense',
        errors: [],
        fitId: '0001',
      });
      expect(rows[1]).toMatchObject({
        line: 2,
        date: '2026-06-16',
        description: 'Salario',
        amount: '5000.00',
        type: 'income',
        errors: [],
        fitId: '0002',
      });
    });

    it('o sinal do valor decide o tipo mesmo com TRNTYPE generico', () => {
      const ofx = '<STMTTRN><TRNTYPE>OTHER<DTPOSTED>20260615<TRNAMT>-15.50<MEMO>Padaria</STMTTRN>';
      const rows = parseOfx(ofx);
      expect(rows[0].type).toBe('expense');
      expect(rows[0].amount).toBe('15.50');
    });

    it('sem sinal, o TRNTYPE de debito decide a saida', () => {
      const ofx = '<STMTTRN><TRNTYPE>PAYMENT<DTPOSTED>20260615<TRNAMT>250.00<MEMO>Fatura</STMTTRN>';
      const rows = parseOfx(ofx);
      expect(rows[0].type).toBe('expense');
    });

    it('aceita o formato XML (OFX 2.x)', () => {
      const ofx = [
        '<STMTTRN>',
        '  <TRNTYPE>CREDIT</TRNTYPE>',
        '  <DTPOSTED>20260616</DTPOSTED>',
        '  <TRNAMT>1234.56</TRNAMT>',
        '  <FITID>0003</FITID>',
        '  <MEMO>Reembolso</MEMO>',
        '</STMTTRN>',
      ].join('\n');
      const rows = parseOfx(ofx);
      expect(rows[0]).toMatchObject({
        date: '2026-06-16',
        description: 'Reembolso',
        amount: '1234.56',
        type: 'income',
        errors: [],
      });
    });

    it('decodifica entidades e usa NAME quando nao ha MEMO', () => {
      const ofx = '<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260615<TRNAMT>-5.00<NAME>P&amp;D</STMTTRN>';
      const rows = parseOfx(ofx);
      expect(rows[0].description).toBe('P&D');
    });

    it('acumula os erros de cada lancamento', () => {
      const ofx = [
        '<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>ruim<TRNAMT>-5.00<MEMO>X</STMTTRN>',
        '<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260615<TRNAMT>-5.00</STMTTRN>',
        '<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260615<TRNAMT>abc<MEMO>Y</STMTTRN>',
      ].join('\n');
      const rows = parseOfx(ofx);
      expect(rows[0].errors).toContain('data_invalida');
      expect(rows[1].errors).toContain('descricao_ausente');
      expect(rows[2].errors).toContain('valor_invalido');
    });

    it('devolve lista vazia quando nao ha STMTTRN', () => {
      expect(parseOfx('<OFX></OFX>')).toEqual([]);
    });
  });
});
